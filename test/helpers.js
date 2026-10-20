import { buildMenu, parseCsv } from '../lib/menu.js';
import { createStore } from '../lib/store.js';

// Mirrors the sheet: an older version in the documented column order, then a
// newer one written with version_id and captured_at swapped.
export const SHEET_CSV = [
  'captured_at,version_id,catalogue_id,item_name,category,all_categories,subcategory,variant_id,variant_name,price_inr,best_seller,food_type,gst_rate,gst_type,modifier_group_id,description,image_url',
  '2026-10-08T19:42:06+05:30,1,709706422,Masala Chai,Drinks,Drinks,Tea,111,2 Cups,59,0,,,,,,',
  '7,2026-10-14T04:25:07+05:30,ctl_709706422,Masala Chai,Drinks,Drinks,Hot Beverages/Tea/Chai,1057191636,2 Cups (200 ml),69,0,Veg',
  '7,2026-10-14T04:25:07+05:30,ctl_709706422,Masala Chai,Drinks,Drinks,Hot Beverages/Tea/Chai,1057191637,4 Cups (400 ml),138,0,Veg',
  '7,2026-10-14T04:25:07+05:30,ctl_790001481,Cold Coffee,Drinks,Drinks,Shakes,1054133515,,89,0,Veg',
  '7,2026-10-14T04:25:07+05:30,ctl_693269670,"Aloo Paratha Meal (2 Pcs with Curd, Chutney and Pickle)",Best Sellers,"Best Sellers, Meals and Combos",Stuffed Paratha Meals,1083854365,Add 1 Butter Chiplet,149,1,Veg',
  '7,2026-10-14T04:25:07+05:30,ctl_693269670,"Aloo Paratha Meal (2 Pcs with Curd, Chutney and Pickle)",Best Sellers,"Best Sellers, Meals and Combos",Stuffed Paratha Meals,1083854364,No Butter Chiplet,139,1,Veg',
  ...Array.from({ length: 11 }, (_, i) =>
    `7,2026-10-14T04:25:07+05:30,ctl_9000${i},Samosa ${i + 1},Quick Bites & Snacks,Quick Bites & Snacks,Snacks,8000${i},,${50 + i},0,Veg`,
  ),
].join('\n');

export const menu = () => buildMenu(parseCsv(SHEET_CSV));

export function fakeWhatsApp() {
  const sent = [];
  return {
    sent,
    last: () => sent[sent.length - 1],
    async sendText(to, body) {
      sent.push({ type: 'text', to, body });
    },
    async sendButtons(to, body, buttons) {
      sent.push({ type: 'buttons', to, body, buttons });
    },
    async sendList(to, body, button, section, rows) {
      sent.push({ type: 'list', to, body, rows });
    },
    async markRead() {},
  };
}

export function deps(overrides = {}) {
  const config = {
    businessName: 'Shuddh Desi Bites',
    ownerNumber: '919900000000',
    humanHandoffMinutes: 120,
    ...overrides.config,
  };
  return {
    config,
    wa: fakeWhatsApp(),
    store: createStore({}),
    ai: null,
    loadMenu: async () => menu(),
    now: Date.parse('2026-10-20T10:00:00Z'),
    ...overrides,
    config,
  };
}

export const text = (body, from = '919811111111') => ({ from, id: `m${Math.random()}`, type: 'text', text: { body } });
export const tap = (id, from = '919811111111') => ({
  from,
  id: `m${Math.random()}`,
  type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id, title: id } },
});
