// Blizzard Developer API Terms of Use, section 2(t): data from the API may be
// kept for no longer than 30 days. The published window holds the 29 complete
// UTC days before today, so the oldest day is at most 30 days old when the
// next daily run replaces it.
export const RETENTION_DAYS = 30;
export const WINDOW_DAYS = RETENTION_DAYS - 1;

export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function oldestKeptDay(now = new Date()) {
  return addDays(utcToday(now), -WINDOW_DAYS);
}

// The window's days, oldest first, ending yesterday.
export function windowDays(now = new Date()) {
  const oldest = oldestKeptDay(now);
  return Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(oldest, i));
}
