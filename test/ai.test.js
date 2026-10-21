import assert from 'node:assert/strict';
import test from 'node:test';
import { HANDOFF, createAi, systemPrompt } from '../lib/ai.js';
import { menu } from './helpers.js';

const config = { businessName: 'Shuddh Desi Bites', claudeModel: 'claude-opus-5-5' };

function fakeClient(response) {
  const calls = [];
  return { calls, beta: { messages: { create: async (params) => (calls.push(params), response) } } };
}

test('sends the menu in the system prompt with refusal fallbacks on', async () => {
  const client = fakeClient({
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Masala Chai is ₹69.' }],
  });
  const ai = createAi(config, client);
  const answer = await ai.answer(menu(), [{ role: 'user', content: 'chai price?' }]);
  assert.equal(answer, 'Masala Chai is ₹69.');
  const params = client.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.match(params.system, /Masala Chai: 2 Cups \(200 ml\): ₹69/);
});

test('a refusal or an empty answer hands the chat to a person', async () => {
  assert.equal(await createAi(config, fakeClient({ stop_reason: 'refusal', content: [] })).answer(menu(), []), HANDOFF);
  assert.equal(await createAi(config, fakeClient({ stop_reason: 'end_turn', content: [] })).answer(menu(), []), HANDOFF);
});

test('no API key means no Claude replies', () => {
  assert.equal(createAi({ ...config, anthropicApiKey: '' }), null);
  assert.match(systemPrompt(config, menu()), /Reply with exactly HANDOFF/);
});
