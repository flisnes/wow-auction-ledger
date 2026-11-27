// Statistics over one item's daily series in the retention window, for the
// price verdict in the addon (docs/ideas.md, section 1). A series has one
// value per window day, oldest first, and null for days without listings.
//
// The fit is Theil-Sen (median of pairwise slopes), so single spikes do not
// tilt the trend, in line with the median and MAD.

// Series with fewer days of listings get no statistics.
export const MIN_DAYS = 3;

// Order of the per-series values in the generated data. Fields can be added,
// removed or reordered: the addon looks them up by name through statFields.
export const SERIES_FIELDS = [
  'median', // median of the daily values
  'mad', // median absolute deviation from the median (unscaled)
  'p10', 'p25', 'p75', 'p90', // quantiles, linear interpolation
  'mean', 'std', // population mean and standard deviation
  'slope', // trend in copper per day
  'trend', // trend value for today (the day after the window)
  'resMad', // median absolute residual from the trend
];

export function seriesStats(series) {
  const points = [];
  series.forEach((y, x) => {
    if (y != null) points.push([x, y]);
  });
  if (points.length < MIN_DAYS) return null;

  const ys = points.map(([, y]) => y).sort((a, b) => a - b);
  const median = quantile(ys, 0.5);
  const mean = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const variance = ys.reduce((sum, y) => sum + (y - mean) ** 2, 0) / ys.length;

  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
    }
  }
  const slope = medianOf(slopes);
  const intercept = medianOf(points.map(([x, y]) => y - slope * x));

  return {
    median,
    mad: medianOf(ys.map((y) => Math.abs(y - median))),
    p10: quantile(ys, 0.1),
    p25: quantile(ys, 0.25),
    p75: quantile(ys, 0.75),
    p90: quantile(ys, 0.9),
    mean,
    std: Math.sqrt(variance),
    slope,
    trend: intercept + slope * series.length,
    resMad: medianOf(points.map(([x, y]) => Math.abs(y - intercept - slope * x))),
  };
}

// Prices are whole copper. The slope keeps one decimal so cheap items do not
// round to a flat trend.
export function formatStats(stats) {
  if (!stats) return SERIES_FIELDS.map(() => '');
  return SERIES_FIELDS.map((f) => (f === 'slope' ? Math.round(stats[f] * 10) / 10 : Math.round(stats[f])));
}

export function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

function medianOf(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}
