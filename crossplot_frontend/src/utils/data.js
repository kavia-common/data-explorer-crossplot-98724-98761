//
// Data utilities for the Crossplot frontend
//

/**
 * Determine if a string resembles a date (not a bare integer).
 */
function looksLikeDateString(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  // Avoid simple integer strings (likely IDs)
  if (/^\d{1,10}$/.test(s)) return false;
  // ISO or common patterns
  if (s.includes('-') || s.includes('/') || s.includes('T') || s.includes(':')) return true;
  return false;
}

/**
 * Returns true if the value is numeric or a numeric string.
 */
export function isNumericValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return false;
    const n = Number(s);
    return Number.isFinite(n);
  }
  return false;
}

/**
 * Returns true if the value is a parseable date (Date.parse OK) and looks like a date string.
 */
export function isParsableDate(v) {
  if (v == null) return false;
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v === 'string' && looksLikeDateString(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t);
  }
  return false;
}

/**
 * Convert any input to numeric value if possible, else NaN.
 */
export function numericValue(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return Number(v);
  if (typeof v === 'string') return Number(v.trim());
  return NaN;
}

/**
 * Compute array extent [min, max]. Returns [NaN, NaN] if empty.
 */
export function extent(values) {
  if (!values || values.length === 0) return [NaN, NaN];
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min === Infinity || max === -Infinity) return [NaN, NaN];
  return [min, max];
}

/**
 * Generate human-friendly ticks between start and stop.
 */
export function niceTicks(start, stop, count = 5) {
  if (!(Number.isFinite(start) && Number.isFinite(stop))) return [];
  if (start === stop) return [start];
  const reverse = stop < start;
  const s = reverse ? stop : start;
  const e = reverse ? start : stop;
  const step = niceStep(e - s, count);
  const ticks = [];
  const first = Math.ceil(s / step) * step;
  for (let x = first; x <= e + 1e-9; x += step) ticks.push(x);
  return reverse ? ticks.reverse() : ticks;
}

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / pow10;
  if (err >= 10) return 10 * pow10;
  if (err >= 5) return 5 * pow10;
  if (err >= 2) return 2 * pow10;
  return pow10;
}

/**
 * Clamp a number to [min, max].
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Get unique values from an array.
 */
export function uniqueValues(arr) {
  const s = new Set();
  for (const v of arr) s.add(String(v));
  return Array.from(s.values());
}

/**
 * Attempt to normalize varying API shapes into an array of row objects:
 * - If array at top-level, returns it
 * - Else if object with 'data', 'rows', 'items', 'records', use that
 * - Else returns input as-is
 */
// PUBLIC_INTERFACE
export function normalizeTable(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const keys = ['data', 'rows', 'items', 'records', 'result', 'results'];
    for (const k of keys) {
      if (Array.isArray(json[k])) return json[k];
    }
  }
  return json;
}

/**
 * Infer variable types from row objects.
 * Returns { numeric: string[], categorical: string[], date: string[] }
 */
// PUBLIC_INTERFACE
export function inferVariableTypes(rows, options = {}) {
  const sampleSize = options.sampleSize || Math.min(1000, rows.length);
  const sample = rows.slice(0, sampleSize);

  // collect all keys
  const keySet = new Set();
  for (const r of sample) {
    Object.keys(r || {}).forEach((k) => keySet.add(k));
  }
  const keys = Array.from(keySet);

  const numeric = [];
  const categorical = [];
  const date = [];

  for (const k of keys) {
    const values = sample.map((r) => r?.[k]).filter((v) => v !== undefined && v !== null);

    if (values.length === 0) continue;

    let numCount = 0;
    let dateCount = 0;

    const uniques = new Set();
    for (const v of values) {
      if (isNumericValue(v)) numCount++;
      if (isParsableDate(v)) dateCount++;
      uniques.add(String(v));
    }

    const total = values.length;
    const numRatio = numCount / total;
    const dateRatio = dateCount / total;

    if (numRatio >= 0.9) {
      numeric.push(k);
    } else if (dateRatio >= 0.8) {
      date.push(k);
    } else {
      // treat remaining as categorical
      categorical.push(k);
    }
  }

  return { numeric, categorical, date };
}
