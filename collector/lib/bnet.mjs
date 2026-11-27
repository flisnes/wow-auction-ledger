// Battle.net Game Data API client for the WoW Forever namespaces
// (static-forever-{region}, dynamic-forever-{region}).

const OAUTH_URL = 'https://oauth.battle.net/token';
const REGIONS = new Set(['us', 'eu', 'kr', 'tw']);
const MAX_ATTEMPTS = 4;

export function loadCredentials() {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file. GitHub Actions passes the secrets as environment variables.
  }
  const id = process.env.BNET_CLIENT_ID;
  const secret = process.env.BNET_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Set BNET_CLIENT_ID and BNET_CLIENT_SECRET in the environment or in a .env file.');
  }
  return { id, secret };
}

export async function getToken({ id, secret }) {
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

export function createClient({ region, token, locale = 'en_US' }) {
  if (!REGIONS.has(region)) throw new Error(`Unknown region "${region}". Use one of: ${[...REGIONS].join(', ')}`);
  const host = `https://${region}.api.blizzard.com`;

  // kind is "dynamic" or "static". Returns { body, headers }, or null for an allowed 404.
  async function get(path, kind, { allow404 = false } = {}) {
    const url = new URL(path, host);
    url.searchParams.set('namespace', `${kind}-forever-${region}`);
    url.searchParams.set('locale', locale);

    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`GET ${url.pathname}: ${err.message}`);
        await sleep(2000 * attempt);
        continue;
      }
      if (res.ok) return { body: await res.json(), headers: res.headers };
      if (res.status === 404 && allow404) return null;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new Error(`GET ${url.pathname}?namespace=${kind}-forever-${region}: HTTP ${res.status}`);
      }
      await sleep(2000 * attempt);
    }
  }

  return { region, get };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
