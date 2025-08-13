//
// Color utilities
//

const BASE_PALETTE = [
  '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
  '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf',
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ab'
];

/**
 * Returns a color palette of at least n colors by cycling the base palette.
 */
export function getColorPalette(n) {
  if (n <= BASE_PALETTE.length) return BASE_PALETTE.slice(0, n);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(BASE_PALETTE[i % BASE_PALETTE.length]);
  }
  return out;
}

/**
 * Build a category -> color mapping.
 */
// PUBLIC_INTERFACE
export function getCategoryColorMap(categories) {
  const palette = getColorPalette(categories.length || 1);
  const map = {};
  categories.forEach((c, i) => { map[c] = palette[i]; });
  return map;
}
