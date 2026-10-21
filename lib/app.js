// Webhook handling, kept separate from the Vercel entry point so it can be tested.

import { createAi } from './ai.js';
import { handleMessage } from './bot.js';
import { getConfig, missingWhatsAppSettings } from './config.js';
import { loadMenu } from './menu.js';
import { isValidSignature } from './signature.js';
import { createStore } from './store.js';
import { createWhatsApp } from './whatsapp.js';

export function createApp(overrides = {}) {
  const config = overrides.config || getConfig();
  const deps = {
    config,
    wa: overrides.wa || createWhatsApp(config),
    store: overrides.store || createStore(config),
    ai: overrides.ai !== undefined ? overrides.ai : createAi(config),
    loadMenu: overrides.loadMenu || (() => loadMenu(config)),
  };

  // Meta's one-time check when you save the webhook URL in the app dashboard.
  function verify(url) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Returns the response to send now, plus the work to finish after responding,
  // because Meta retries any webhook that isn't answered quickly.
  async function receive(rawBody, signature) {
    const missing = missingWhatsAppSettings(config);
    if (missing.length) {
      console.error(`Missing settings: ${missing.join(', ')}`);
      return { response: new Response('Not configured', { status: 500 }), work: Promise.resolve() };
    }
    if (!isValidSignature(rawBody, signature, config.appSecret)) {
      return { response: new Response('Bad signature', { status: 401 }), work: Promise.resolve() };
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { response: new Response('Bad JSON', { status: 400 }), work: Promise.resolve() };
    }
    return { response: new Response('OK', { status: 200 }), work: processPayload(payload) };
  }

  async function processPayload(payload) {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
        for (const message of value.messages || []) {
          // Meta can deliver the same message more than once.
          if (!(await deps.store.claim(`seen:${message.id}`, 24 * 3600))) continue;
          try {
            deps.wa.markRead(message.id).catch(() => {});
            await handleMessage(message, { ...deps, contactName: names[message.from] });
          } catch (err) {
            console.error('Failed to handle message', message.id, err);
          }
        }
        // Echoes of messages you send from the Business app arrive under
        // "smb_message_echoes" with coexistence; they need no reply.
      }
    }
  }

  return { verify, receive, processPayload, deps };
}
