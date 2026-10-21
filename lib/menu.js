// Reads the menu from the "Zomato Menu" Google Sheet that the daily Zomato sync
// keeps up to date. The sheet holds every captured version; we use the newest.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
}

const isInt = (v) => /^\d+$/.test(String(v ?? '').trim());
const stripPrefix = (id) => String(id ?? '').trim().replace(/^ctl_/, '');

// Some sync runs wrote version_id and captured_at in swapped columns, so the
// version is whichever of the first two cells is a whole number.
function rowVersion(cells) {
  if (isInt(cells[1])) return Number(cells[1]);
  if (isInt(cells[0])) return Number(cells[0]);
  return null;
}

export function buildMenu(rows) {
  if (!rows.length) return { version: null, items: [], categories: [] };
  const header = rows[0].map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const idx = {
    catalogue: col('catalogue_id'),
    name: col('item_name'),
    category: col('category'),
    allCategories: col('all_categories'),
    subcategory: col('subcategory'),
    variantId: col('variant_id'),
    variantName: col('variant_name'),
    price: col('price_inr'),
    bestSeller: col('best_seller'),
    foodType: col('food_type'),
    description: col('description'),
  };

  const data = rows.slice(1).map((cells) => ({ cells, version: rowVersion(cells) }));
  const version = Math.max(...data.map((d) => d.version ?? -1));
  if (version < 0) return { version: null, items: [], categories: [] };

  const items = new Map();
  const categoryOrder = [];
  for (const { cells, version: v } of data) {
    if (v !== version) continue;
    const get = (i) => (i >= 0 ? String(cells[i] ?? '').trim() : '');
    const price = Number(get(idx.price));
    const variantId = get(idx.variantId);
    if (!variantId || !Number.isFinite(price)) continue;

    const id = stripPrefix(get(idx.catalogue)) || variantId;
    const name = get(idx.name);
    const categories = (get(idx.allCategories) || get(idx.category))
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    for (const c of categories) if (!categoryOrder.includes(c)) categoryOrder.push(c);

    if (!items.has(id)) {
      items.set(id, {
        id,
        name,
        categories,
        subcategory: get(idx.subcategory),
        bestSeller: get(idx.bestSeller) === '1',
        veg: get(idx.foodType).toLowerCase() !== 'non-veg',
        description: get(idx.description),
        variants: [],
      });
    }
    const variantName = get(idx.variantName);
    items.get(id).variants.push({
      id: variantId,
      name: variantName && variantName !== name ? variantName : '',
      price,
    });
  }

  for (const item of items.values()) item.variants.sort((a, b) => a.price - b.price);
  const categories = [
    ...categoryOrder.filter((c) => c === 'Best Sellers'),
    ...categoryOrder.filter((c) => c !== 'Best Sellers'),
  ];
  return { version, items: [...items.values()], categories };
}

export function itemsInCategory(menu, category) {
  return menu.items.filter((i) => i.categories.includes(category));
}

export function findItem(menu, itemId) {
  return menu.items.find((i) => i.id === itemId) || null;
}

export function findVariant(menu, variantId) {
  for (const item of menu.items) {
    const variant = item.variants.find((v) => v.id === variantId);
    if (variant) return { item, variant };
  }
  return null;
}

export function variantLabel(item, variant) {
  return variant.name ? `${item.name} (${variant.name})` : item.name;
}

export function formatPrice(n) {
  return `₹${n}`;
}

// Plain-text menu for the Claude prompt.
export function menuAsText(menu) {
  return menu.categories
    .map((cat) => {
      const lines = itemsInCategory(menu, cat).map((item) => {
        const options = item.variants
          .map((v) => `${v.name ? `${v.name}: ` : ''}${formatPrice(v.price)}`)
          .join('; ');
        const desc = item.description ? ` (${item.description})` : '';
        return `- ${item.name}: ${options}${desc}`;
      });
      return `## ${cat}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

export function sheetCsvUrl(config) {
  if (config.menuCsvUrl) return config.menuCsvUrl;
  // The plain CSV export keeps every cell as written. The gviz endpoint guesses a
  // type per column and blanks cells that don't match, which breaks mixed columns.
  return `https://docs.google.com/spreadsheets/d/${config.menuSheetId}/export?format=csv&gid=${config.menuSheetGid}`;
}

let cache = { menu: null, at: 0 };

export async function loadMenu(config, fetchImpl = fetch, now = Date.now()) {
  if (cache.menu && now - cache.at < config.menuCacheSeconds * 1000) return cache.menu;
  const res = await fetchImpl(sheetCsvUrl(config));
  if (!res.ok) {
    if (cache.menu) return cache.menu;
    throw new Error(`Menu sheet returned ${res.status}. Is it shared as "Anyone with the link can view"?`);
  }
  const menu = buildMenu(parseCsv(await res.text()));
  if (!menu.items.length) {
    if (cache.menu) return cache.menu;
    throw new Error('Menu sheet has no usable rows');
  }
  cache = { menu, at: now };
  return menu;
}

export function resetMenuCache() {
  cache = { menu: null, at: 0 };
}
