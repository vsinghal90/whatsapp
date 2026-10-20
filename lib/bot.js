// The conversation. Buttons and lists carry the ordering path; free text goes to
// Claude when it's configured. Anything the bot can't handle is left for a person,
// who answers from the WhatsApp Business app on the phone (coexistence).

import { HANDOFF } from './ai.js';
import {
  findItem,
  findVariant,
  formatPrice,
  itemsInCategory,
  variantLabel,
} from './menu.js';

const STATE_TTL = 7 * 24 * 3600;
const PAGE_SIZE = 9; // the 10th list row is "More"
const HISTORY_TURNS = 6;
const GREETING = /^(hi+|hello|hey|hii+|namaste|menu|start|order)\b/i;

const emptyState = () => ({ step: 'idle', cart: [], address: '', humanUntil: 0, history: [] });

export function cartTotal(cart) {
  return cart.reduce((sum, line) => sum + line.price * line.qty, 0);
}

export function cartSummary(cart) {
  const lines = cart.map((l) => `• ${l.qty} × ${l.label}: ${formatPrice(l.price * l.qty)}`);
  return `${lines.join('\n')}\n\nTotal: ${formatPrice(cartTotal(cart))}`;
}

// The id a customer's tap or message carries, or null for free text.
export function replyId(message) {
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || null;
  }
  if (message.type === 'button') return message.button?.payload || null;
  return null;
}

export async function handleMessage(message, deps) {
  const { store, wa, now = Date.now() } = deps;
  const from = message.from;
  const key = `chat:${from}`;
  const state = { ...emptyState(), ...((await store.get(key)) || {}) };

  const id = replyId(message);

  // While a person has the chat, the bot stays quiet unless the customer taps
  // Menu or types "menu". A plain "hello?" is usually them waiting for the team.
  if (state.humanUntil > now) {
    const text = message.type === 'text' ? message.text.body.trim() : '';
    if (id !== 'menu' && !/^menu$/i.test(text)) return;
    state.humanUntil = 0;
  }

  const ctx = { ...deps, from, state, now };
  if (id) await handleTap(id, ctx);
  else if (message.type === 'text') await handleText(message.text.body.trim(), ctx);
  else if (message.type === 'location') await handleLocation(message.location, ctx);
  else await wa.sendText(from, 'Sorry, I can only read text messages here. Type *menu* to see what we have today.');

  await store.set(key, state, STATE_TTL);
}

async function handleTap(id, ctx) {
  const { wa, from, state } = ctx;
  const [kind, a, b] = id.split(':');
  const menu = await ctx.loadMenu();

  switch (kind) {
    case 'menu':
      return sendCategories(ctx, menu);
    case 'cat':
      return sendCategory(ctx, menu, a, Number(b || 0));
    case 'item': {
      const item = findItem(menu, a);
      if (!item) return sendCategories(ctx, menu, 'That dish is no longer on the menu.');
      if (item.variants.length === 1) return sendQuantity(ctx, item, item.variants[0]);
      return wa.sendList(
        from,
        `${item.name}\n\nPick an option:`,
        'Options',
        'Options',
        item.variants.slice(0, 10).map((v) => ({
          id: `var:${v.id}`,
          title: v.name || item.name,
          description: formatPrice(v.price),
        })),
      );
    }
    case 'var': {
      const found = findVariant(menu, a);
      if (!found) return sendCategories(ctx, menu, 'That option is no longer on the menu.');
      return sendQuantity(ctx, found.item, found.variant);
    }
    case 'qty': {
      const found = findVariant(menu, a);
      if (!found) return sendCategories(ctx, menu, 'That option is no longer on the menu.');
      const qty = Math.max(1, Math.min(20, Number(b) || 1));
      const label = variantLabel(found.item, found.variant);
      const line = state.cart.find((l) => l.variantId === found.variant.id);
      if (line) line.qty += qty;
      else state.cart.push({ variantId: found.variant.id, label, price: found.variant.price, qty });
      state.step = 'idle';
      return wa.sendButtons(from, `Added ${qty} × ${label}.\n\n${cartSummary(state.cart)}`, [
        { id: 'checkout', title: 'Checkout' },
        { id: 'menu', title: 'Add more' },
        { id: 'cart', title: 'View cart' },
      ]);
    }
    case 'cart':
      return sendCart(ctx);
    case 'clear':
      state.cart = [];
      state.step = 'idle';
      return wa.sendButtons(from, 'Your cart is empty now.', [{ id: 'menu', title: 'Menu' }]);
    case 'checkout':
      if (!state.cart.length) return sendCategories(ctx, menu, 'Your cart is empty. Pick something first:');
      state.step = 'await_address';
      return wa.sendText(
        from,
        `${cartSummary(state.cart)}\n\nPlease send your delivery address (flat, building, area), or share your location using 📎 → Location.`,
      );
    case 'confirm':
      return confirmOrder(ctx);
    case 'human':
      return handOff(ctx, 'Sure, someone from our team will reply here shortly. 🙏');
    default:
      return sendWelcome(ctx);
  }
}

async function handleText(text, ctx) {
  const { state } = ctx;
  if (state.step === 'await_address' && state.cart.length) {
    state.address = text;
    return sendConfirm(ctx);
  }
  if (GREETING.test(text) || !ctx.ai) return sendWelcome(ctx);

  const menu = await ctx.loadMenu();
  state.history = [...state.history, { role: 'user', content: text }].slice(-HISTORY_TURNS);
  let answer;
  try {
    answer = await ctx.ai.answer(menu, state.history);
  } catch (err) {
    console.error('Claude call failed', err);
    answer = HANDOFF;
  }
  if (answer.trim() === HANDOFF) {
    state.history = [];
    return handOff(ctx, "I'll pass this to our team, and someone will reply here shortly. 🙏");
  }
  state.history = [...state.history, { role: 'assistant', content: answer }].slice(-HISTORY_TURNS);
  return ctx.wa.sendButtons(ctx.from, answer, [
    { id: 'menu', title: 'Menu' },
    { id: 'cart', title: 'My cart' },
    { id: 'human', title: 'Talk to us' },
  ]);
}

async function handleLocation(location, ctx) {
  const { state } = ctx;
  if (state.step !== 'await_address' || !state.cart.length) return sendWelcome(ctx);
  const place = [location.name, location.address].filter(Boolean).join(', ');
  const pin = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  state.address = place ? `${place} (${pin})` : pin;
  return sendConfirm(ctx);
}

function sendWelcome(ctx) {
  return ctx.wa.sendButtons(
    ctx.from,
    `Namaste! 🙏 Welcome to ${ctx.config.businessName}. Fresh, home-style food made to order. What would you like to do?`,
    [
      { id: 'menu', title: 'Menu' },
      { id: 'cart', title: 'My cart' },
      { id: 'human', title: 'Talk to us' },
    ],
  );
}

function sendCategories(ctx, menu, intro = 'What are you in the mood for?') {
  return ctx.wa.sendList(
    ctx.from,
    intro,
    'See menu',
    'Menu',
    menu.categories.slice(0, 10).map((c) => ({
      id: `cat:${c}:0`,
      title: c,
      description: `${itemsInCategory(menu, c).length} dishes`,
    })),
  );
}

function sendCategory(ctx, menu, category, page) {
  const items = itemsInCategory(menu, category);
  if (!items.length) return sendCategories(ctx, menu);
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const rows = pageItems.map((item) => {
    const from = item.variants[0].price;
    const priced = item.variants.length > 1 ? `from ${formatPrice(from)}` : formatPrice(from);
    return {
      id: `item:${item.id}`,
      title: item.name,
      description: `${priced}${item.bestSeller ? ' · Best seller' : ''} · ${item.name}`,
    };
  });
  if (start + PAGE_SIZE < items.length) {
    rows.push({ id: `cat:${category}:${page + 1}`, title: 'More dishes →' });
  }
  return ctx.wa.sendList(ctx.from, `${category}: tap a dish to add it.`, 'Choose dish', category, rows);
}

function sendQuantity(ctx, item, variant) {
  return ctx.wa.sendButtons(
    ctx.from,
    `${variantLabel(item, variant)}: ${formatPrice(variant.price)}${item.description ? `\n\n${item.description}` : ''}\n\nHow many?`,
    [1, 2, 3].map((n) => ({ id: `qty:${variant.id}:${n}`, title: String(n) })),
  );
}

function sendCart(ctx) {
  const { state } = ctx;
  if (!state.cart.length) {
    return ctx.wa.sendButtons(ctx.from, 'Your cart is empty.', [{ id: 'menu', title: 'Menu' }]);
  }
  return ctx.wa.sendButtons(ctx.from, `Your cart:\n\n${cartSummary(state.cart)}`, [
    { id: 'checkout', title: 'Checkout' },
    { id: 'menu', title: 'Add more' },
    { id: 'clear', title: 'Clear cart' },
  ]);
}

function sendConfirm(ctx) {
  const { state } = ctx;
  state.step = 'await_confirm';
  return ctx.wa.sendButtons(
    ctx.from,
    `Please check your order:\n\n${cartSummary(state.cart)}\n\nDeliver to: ${state.address}`,
    [
      { id: 'confirm', title: 'Place order' },
      { id: 'cart', title: 'Edit cart' },
      { id: 'human', title: 'Talk to us' },
    ],
  );
}

async function confirmOrder(ctx) {
  const { state, from, wa, store, config, now } = ctx;
  if (!state.cart.length || !state.address) return sendCart(ctx);

  const orderId = `SDB-${new Date(now).toISOString().slice(2, 10).replace(/-/g, '')}-${String(now).slice(-4)}`;
  const order = {
    orderId,
    customer: from,
    name: ctx.contactName || '',
    items: state.cart,
    total: cartTotal(state.cart),
    address: state.address,
    placedAt: new Date(now).toISOString(),
  };
  await store.push('orders', order);

  await wa.sendText(
    from,
    `✅ Order ${orderId} received!\n\n${cartSummary(state.cart)}\n\nDeliver to: ${state.address}\n\nWe'll confirm here shortly with the delivery time and payment details.`,
  );

  if (config.ownerNumber) {
    try {
      await wa.sendText(
        config.ownerNumber,
        `🛎️ New WhatsApp order ${orderId}\nFrom: ${order.name || 'Customer'} (+${from})\n\n${cartSummary(state.cart)}\n\nAddress: ${state.address}`,
      );
    } catch (err) {
      // Meta only allows free-form messages to numbers that wrote in during the
      // last 24 hours, so this can fail; the order is still saved and visible in
      // the WhatsApp Business app.
      console.error('Owner notification failed', err);
    }
  }

  state.cart = [];
  state.address = '';
  state.step = 'idle';
  // Let the team take over for questions about this order.
  state.humanUntil = now + config.humanHandoffMinutes * 60 * 1000;
}

function handOff(ctx, text) {
  ctx.state.humanUntil = ctx.now + ctx.config.humanHandoffMinutes * 60 * 1000;
  ctx.state.step = 'idle';
  return ctx.wa.sendText(ctx.from, text);
}
