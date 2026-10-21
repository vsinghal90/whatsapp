import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createApp } from '../lib/app.js';
import { deps, text } from './helpers.js';

const config = {
  ...deps().config,
  accessToken: 't',
  phoneNumberId: '1',
  appSecret: 'shh',
  verifyToken: 'verify-me',
};

function app() {
  const d = deps({ config });
  return { d, app: createApp({ config, wa: d.wa, store: d.store, ai: null, loadMenu: d.loadMenu }) };
}

const sign = (body) => `sha256=${crypto.createHmac('sha256', 'shh').update(body).digest('hex')}`;
const payload = (message) =>
  JSON.stringify({
    entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: message.from, profile: { name: 'Asha' } }], messages: [message] } }] }],
  });

test('answers Meta verification only with the right token', async () => {
  const { app: a } = app();
  const ok = a.verify(new URL('https://x/api/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '42');
  const bad = a.verify(new URL('https://x/api/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42'));
  assert.equal(bad.status, 403);
});

test('rejects unsigned posts', async () => {
  const { app: a } = app();
  const { response } = await a.receive(payload(text('hi')), 'sha256=00');
  assert.equal(response.status, 401);
});

test('handles a signed message once, even if Meta sends it twice', async () => {
  const { app: a, d } = app();
  const body = payload({ ...text('hi'), id: 'wamid.1' });
  for (let i = 0; i < 2; i++) {
    const { response, work } = await a.receive(body, sign(body));
    assert.equal(response.status, 200);
    await work;
  }
  assert.equal(d.wa.sent.length, 1);
  assert.match(d.wa.sent[0].body, /Welcome to Shuddh Desi Bites/);
});
