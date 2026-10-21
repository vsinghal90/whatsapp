// Conversation state per customer. Uses Upstash Redis over its REST API when
// configured (Vercel's Upstash integration sets these variables), and falls back
// to memory for local runs. Serverless instances don't share memory, so set up
// Redis before going live.

export function createStore(config, fetchImpl = fetch) {
  if (config.redisUrl && config.redisToken) return redisStore(config, fetchImpl);
  return memoryStore();
}

function memoryStore() {
  const data = new Map();
  const alive = (key) => {
    const entry = data.get(key);
    if (!entry) return null;
    if (entry.expires && entry.expires < Date.now()) {
      data.delete(key);
      return null;
    }
    return entry;
  };
  return {
    async get(key) {
      const entry = alive(key);
      return entry ? JSON.parse(entry.value) : null;
    },
    async set(key, value, ttlSeconds) {
      data.set(key, {
        value: JSON.stringify(value),
        expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
      });
    },
    // true when the key was new
    async claim(key, ttlSeconds) {
      if (alive(key)) return false;
      data.set(key, { value: '1', expires: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async push(key, value) {
      const list = alive(key) ? JSON.parse(data.get(key).value) : [];
      list.push(value);
      data.set(key, { value: JSON.stringify(list), expires: 0 });
    },
  };
}

function redisStore(config, fetchImpl) {
  async function command(args) {
    const res = await fetchImpl(config.redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
    return (await res.json()).result;
  }
  return {
    async get(key) {
      const value = await command(['GET', key]);
      return value == null ? null : JSON.parse(value);
    },
    async set(key, value, ttlSeconds) {
      const args = ['SET', key, JSON.stringify(value)];
      if (ttlSeconds) args.push('EX', String(ttlSeconds));
      await command(args);
    },
    async claim(key, ttlSeconds) {
      return (await command(['SET', key, '1', 'NX', 'EX', String(ttlSeconds)])) === 'OK';
    },
    async push(key, value) {
      await command(['RPUSH', key, JSON.stringify(value)]);
    },
  };
}
