import assert from 'node:assert/strict';
import test from 'node:test';
import { HANDOFF } from '../lib/ai.js';
import { handleMessage } from '../lib/bot.js';
import { deps, tap, text } from './helpers.js';

test('a greeting gets the welcome buttons', async () => {
  const d = deps();
  await handleMessage(text('Hi'), d);
  assert.deepEqual(d.wa.last().buttons.map((b) => b.id), ['menu', 'cart', 'human']);
});

test('Menu lists the categories, and a long category pages with "More"', async () => {
  const d = deps();
  await handleMessage(tap('menu'), d);
  assert.deepEqual(d.wa.last().rows.map((r) => r.id), [
    'cat:Best Sellers:0',
    'cat:Drinks:0',
    'cat:Meals and Combos:0',
    'cat:Quick Bites & Snacks:0',
  ]);

  await handleMessage(tap('cat:Quick Bites & Snacks:0'), d);
  const rows = d.wa.last().rows;
  assert.equal(rows.length, 10);
  assert.equal(rows[9].id, 'cat:Quick Bites & Snacks:1');

  await handleMessage(tap('cat:Quick Bites & Snacks:1'), d);
  assert.deepEqual(d.wa.last().rows.map((r) => r.title), ['Samosa 10', 'Samosa 11']);
});

test('full order: option, quantity, address, confirm', async () => {
  const d = deps();
  await handleMessage(tap('item:693269670'), d);
  assert.deepEqual(d.wa.last().rows.map((r) => r.id), ['var:1083854364', 'var:1083854365']);

  await handleMessage(tap('var:1083854364'), d);
  assert.deepEqual(d.wa.last().buttons.map((b) => b.id), [
    'qty:1083854364:1',
    'qty:1083854364:2',
    'qty:1083854364:3',
  ]);

  await handleMessage(tap('qty:1083854364:2'), d);
  await handleMessage(tap('qty:1054133515:1'), d);
  assert.match(d.wa.last().body, /Total: ₹367/);

  await handleMessage(tap('checkout'), d);
  assert.match(d.wa.last().body, /delivery address/);

  await handleMessage(text('Flat 402, Prestige Lakeside, Bellandur'), d);
  assert.match(d.wa.last().body, /Deliver to: Flat 402/);
  assert.equal(d.wa.last().buttons[0].id, 'confirm');

  await handleMessage(tap('confirm'), d);
  const [toCustomer, toOwner] = d.wa.sent.slice(-2);
  assert.match(toCustomer.body, /Order SDB-261020-\d{4} received/);
  assert.match(toCustomer.body, /2 × Aloo Paratha Meal .*\(No Butter Chiplet\): ₹278/);
  assert.equal(toOwner.to, '919900000000');
  assert.match(toOwner.body, /Address: Flat 402/);

  const state = await d.store.get('chat:919811111111');
  assert.deepEqual(state.cart, []);
});

test('a single-option dish goes straight to quantity', async () => {
  const d = deps();
  await handleMessage(tap('item:790001481'), d);
  assert.match(d.wa.last().body, /Cold Coffee: ₹89/);
});

test('a shared location works as the address', async () => {
  const d = deps();
  await handleMessage(tap('qty:1054133515:1'), d);
  await handleMessage(tap('checkout'), d);
  await handleMessage(
    { from: '919811111111', id: 'loc', type: 'location', location: { latitude: 12.9, longitude: 77.6, name: 'Home' } },
    d,
  );
  assert.match(d.wa.last().body, /Deliver to: Home \(https:\/\/maps\.google\.com\/\?q=12\.9,77\.6\)/);
});

test('free text goes to Claude, and its answer comes with buttons', async () => {
  const seen = [];
  const d = deps({
    ai: {
      async answer(menu, history) {
        seen.push(history);
        return 'Try the Aloo Paratha Meal, our best seller at ₹139.';
      },
    },
  });
  await handleMessage(text('what do you recommend for lunch?'), d);
  assert.equal(d.wa.last().body, 'Try the Aloo Paratha Meal, our best seller at ₹139.');
  assert.deepEqual(seen[0], [{ role: 'user', content: 'what do you recommend for lunch?' }]);
});

test('a hand-off keeps the bot quiet until the customer starts again', async () => {
  const d = deps({ ai: { answer: async () => HANDOFF } });
  await handleMessage(text('my order was cold'), d);
  assert.match(d.wa.last().body, /pass this to our team/);

  const count = d.wa.sent.length;
  await handleMessage(text('hello? still waiting'), d);
  await handleMessage(text('ok thanks'), d);
  assert.equal(d.wa.sent.length, count);

  await handleMessage(tap('menu'), d);
  assert.equal(d.wa.sent.length, count + 1);
});

test('without Claude configured, free text gets the welcome', async () => {
  const d = deps();
  await handleMessage(text('do you deliver to HSR?'), d);
  assert.equal(d.wa.last().buttons[0].id, 'menu');
});

test('the conversation sent to Claude always starts with the customer', async () => {
  const seen = [];
  const d = deps({ ai: { answer: async (menu, history) => (seen.push(history), 'Sure.') } });
  for (let i = 0; i < 5; i++) await handleMessage(text(`question ${i}`), d);
  for (const history of seen) {
    assert.equal(history[0].role, 'user');
    assert.ok(history.length <= 6);
  }
  assert.equal(seen[4].at(-1).content, 'question 4');
});
