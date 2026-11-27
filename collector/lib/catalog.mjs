// Item names, quality, class and icons from the item and media search
// endpoints, for the website. The catalog is fetched again on every run and
// never stored, so names fall under the same 30-day limit as prices without a
// cache to expire.
//
// static-forever lacks most original items (Destiny, 647, is missing), so
// static-classic1x (Classic Era) fills in ids that Forever does not have.
//
// Search returns at most 1000 results per query and ignores _page beyond
// that, so it pages by id range: each query starts after the last id seen.

// Locales kept per item: English, plus the local names for KR and TW.
export const LOCALES = ['en_US', 'ko_KR', 'zh_TW'];
// Namespaces in priority order.
export const NAMESPACES = ['static', 'static-classic1x'];
const PAGE_SIZE = 1000;
// Upper bound for the id range; search rejects an open-ended range ("[1,]").
const MAX_ID = 2 ** 31 - 1;

export async function searchAll(api, index, { kind = 'static', query = '' } = {}) {
  const results = [];
  for (let from = 1; ;) {
    const { body } = await api.get(
      `/data/wow/search/${index}?id=[${from},${MAX_ID}]&orderby=id&_pageSize=${PAGE_SIZE}${query}`, kind);
    const page = body.results ?? [];
    results.push(...page.map((r) => r.data));
    if (page.length < PAGE_SIZE) return results;
    from = page.at(-1).data.id + 1;
  }
}

export async function fetchCatalog(api) {
  const sources = [];
  for (const kind of NAMESPACES) {
    sources.push({
      items: await searchAll(api, 'item', { kind }),
      media: await searchAll(api, 'media', { kind, query: '&tags=item' }),
    });
  }
  return buildCatalog(sources);
}

// sources: [{ items, media }] in priority order, holding the `data` objects of
// item and media search results. An item takes its icon from its own source.
export function buildCatalog(sources) {
  let iconBase = null;
  const classes = {};
  const out = {};
  for (const { items, media } of sources) {
    const icons = new Map();
    for (const m of media) {
      const icon = m.assets?.find((a) => a.key === 'icon');
      if (!icon?.file_data_id) continue;
      icons.set(m.id, icon.file_data_id);
      iconBase ??= baseOf(icon.value, icon.file_data_id);
    }
    for (const item of items) {
      if (item.id in out) continue;
      const name = {};
      for (const locale of LOCALES) {
        const value = localized(item.name, locale);
        if (value) name[locale] = value;
      }
      const classId = item.item_class?.id ?? null;
      if (classId != null && !(classId in classes)) {
        classes[classId] = localized(item.item_class.name, 'en_US') ?? String(classId);
      }
      out[item.id] = {
        name,
        quality: item.quality?.type ?? null,
        classId,
        subclass: localized(item.item_subclass?.name, 'en_US'),
        icon: icons.get(item.media?.id ?? item.id) ?? null,
      };
    }
  }
  return { iconBase, classes, items: out };
}

// Search results hold every locale ({ en_US: ... }); item endpoints hold one string.
function localized(value, locale) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value[locale] ?? null;
}

// "https://render.worldofwarcraft.com/forever-eu/icons/56/132889.jpg" -> "https://.../icons/56/"
function baseOf(url, fileDataId) {
  if (typeof url !== 'string') return null;
  const suffix = `${fileDataId}.jpg`;
  return url.endsWith(suffix) ? url.slice(0, -suffix.length) : null;
}
