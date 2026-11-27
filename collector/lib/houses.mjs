// Forever has no connected realms. Auction houses are listed under rulesets
// instead, and every ruleset lists the same houses with identical contents,
// so each house is fetched once (through the first ruleset that lists it).

export async function discoverHouses(api) {
  const { body: index } = await api.get('/data/wow/ruleset/index', 'dynamic');
  const rulesets = findIdList(index);
  if (rulesets.length === 0) {
    throw new Error(`No rulesets in the ruleset index: ${JSON.stringify(index).slice(0, 500)}`);
  }

  const houses = new Map();
  for (const ruleset of rulesets) {
    // The trailing slash is required; without it the endpoint returns 404.
    const res = await api.get(`/data/wow/ruleset/${ruleset.id}/auctions/`, 'dynamic', { allow404: true });
    for (const house of res?.body?.auctions ?? []) {
      if (houses.has(house.id)) continue;
      houses.set(house.id, { id: house.id, name: nameOf(house), rulesetId: ruleset.id });
    }
  }
  return [...houses.values()].sort((a, b) => a.id - b.id);
}

export async function fetchHouseAuctions(api, house) {
  const base = `/data/wow/ruleset/${house.rulesetId}/auctions/${house.id}`;
  const items = await api.get(base, 'dynamic', { allow404: true });
  const commodities = await api.get(`${base}/commodities`, 'dynamic', { allow404: true });
  return {
    items: items?.body?.auctions ?? [],
    commodities: commodities?.body?.auctions ?? [],
    lastModified: items?.headers.get('last-modified') ?? null,
  };
}

function findIdList(body) {
  for (const value of Object.values(body ?? {})) {
    if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v?.id === 'number')) return value;
  }
  return [];
}

function nameOf(house) {
  if (typeof house.name === 'string') return house.name;
  return house.name?.en_US ?? String(house.id);
}
