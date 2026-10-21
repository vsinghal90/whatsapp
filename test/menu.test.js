import assert from 'node:assert/strict';
import test from 'node:test';
import { findVariant, itemsInCategory, menuAsText, parseCsv } from '../lib/menu.js';
import { menu } from './helpers.js';

test('parseCsv handles quoted commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"'],
  ]);
});

test('uses only the newest version, even when its columns are swapped', () => {
  const m = menu();
  assert.equal(m.version, 7);
  const chai = m.items.find((i) => i.name === 'Masala Chai');
  assert.equal(chai.id, '709706422');
  assert.deepEqual(chai.variants.map((v) => v.price), [69, 138]);
});

test('groups variants by dish and sorts them by price', () => {
  const paratha = menu().items.find((i) => i.id === '693269670');
  assert.deepEqual(paratha.variants.map((v) => v.name), ['No Butter Chiplet', 'Add 1 Butter Chiplet']);
  assert.ok(paratha.bestSeller);
  assert.deepEqual(paratha.categories, ['Best Sellers', 'Meals and Combos']);
});

test('puts Best Sellers first and keeps every category', () => {
  assert.deepEqual(menu().categories, ['Best Sellers', 'Drinks', 'Meals and Combos', 'Quick Bites & Snacks']);
  assert.equal(itemsInCategory(menu(), 'Quick Bites & Snacks').length, 11);
});

test('finds a variant and renders the menu as text for the prompt', () => {
  const m = menu();
  assert.equal(findVariant(m, '1054133515').item.name, 'Cold Coffee');
  assert.match(menuAsText(m), /- Masala Chai: 2 Cups \(200 ml\): ₹69; 4 Cups \(400 ml\): ₹138/);
});
