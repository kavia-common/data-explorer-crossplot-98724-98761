import React, { useMemo } from 'react';
import { getCategoryColorMap } from '../utils/colors';
import { numericValue, uniqueValues, clamp, extent, niceTicks } from '../utils/data';
import { isArithmeticExpression, evaluateExpressionOnRow } from '../utils/expression';

/**
 * ScatterPlot renders a basic SVG scatter plot with axes. Points are colored by the chosen
 * categorical variable. Useful for small to medium datasets; for very large sets, sampling
 * is applied for performance.
 *
 * Props:
 * - data: array of row objects
 * - xKey: string, numeric field for x
 * - yKey: string, numeric field for y
 * - cKey: string, categorical field for color
 * - width: number (px)
 * - height: number (px)
 */

// PUBLIC_INTERFACE
export default function ScatterPlot({ data = [], xKey, yKey, cKey, width = 960, height = 560 }) {
  // Margin and size
  const margin = { top: 18, right: 18, bottom: 40, left: 54 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  // Filter, parse, and sample data if large
  const prepared = useMemo(() => {
    const rows = data
      .map((d) => {
        // Resolve x
        let x = NaN;
        if (typeof xKey === 'string' && isArithmeticExpression(xKey)) {
          x = evaluateExpressionOnRow(xKey, d, Object.keys(d));
        } else {
          x = numericValue(d[xKey]);
        }

        // Resolve y (supports arithmetic expressions like a/b)
        let y = NaN;
        if (typeof yKey === 'string' && isArithmeticExpression(yKey)) {
          y = evaluateExpressionOnRow(yKey, d, Object.keys(d));
        } else {
          y = numericValue(d[yKey]);
        }

        const c = d[cKey];
        return (Number.isFinite(x) && Number.isFinite(y)) ? { x, y, c } : null;
      })
      .filter(Boolean);

    // Simple sampling for performance if exceeding 10k points
    const MAX_POINTS = 10000;
    if (rows.length > MAX_POINTS) {
      const step = Math.ceil(rows.length / MAX_POINTS);
      return rows.filter((_, i) => i % step === 0);
    }
    return rows;
  }, [data, xKey, yKey, cKey]);

  const xDomain = useMemo(() => extent(prepared.map(d => d.x)), [prepared]);
  const yDomain = useMemo(() => extent(prepared.map(d => d.y)), [prepared]);
  const categories = useMemo(() => uniqueValues(prepared.map(d => d.c)), [prepared]);
  const colorMap = useMemo(() => getCategoryColorMap(categories), [categories]);

  // Scales
  const xScale = (value) => {
    if (xDomain[0] === xDomain[1]) return margin.left + innerW / 2;
    return margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerW;
  };
  const yScale = (value) => {
    if (yDomain[0] === yDomain[1]) return margin.top + innerH / 2;
    // invert y because SVG y grows downward
    return margin.top + (1 - (value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;
  };

  const xTicks = useMemo(() => niceTicks(xDomain[0], xDomain[1], 5), [xDomain]);
  const yTicks = useMemo(() => niceTicks(yDomain[0], yDomain[1], 5), [yDomain]);

  return (
    <div className="plot-container" role="figure" aria-label="Scatterplot visualization">
      <svg className="plot" viewBox={`0 0 ${width} ${height}`} aria-hidden="false">
        {/* Axes */}
        <g className="axis">
          {/* X axis */}
          <line
            x1={margin.left}
            y1={margin.top + innerH}
            x2={margin.left + innerW}
            y2={margin.top + innerH}
            stroke="#cbd5e1"
          />
          {xTicks.map((t, i) => (
            <g key={`xt-${i}`} transform={`translate(${clamp(xScale(t), margin.left, margin.left + innerW)}, ${margin.top + innerH})`}>
              <line y2="6" stroke="#cbd5e1" />
              <text dy="1.2em" textAnchor="middle">{formatTick(t)}</text>
            </g>
          ))}

          {/* Y axis */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + innerH}
            stroke="#cbd5e1"
          />
          {yTicks.map((t, i) => (
            <g key={`yt-${i}`} transform={`translate(${margin.left}, ${clamp(yScale(t), margin.top, margin.top + innerH)})`}>
              <line x1="-6" x2="0" stroke="#cbd5e1" />
              <text x="-10" dy="0.32em" textAnchor="end">{formatTick(t)}</text>
            </g>
          ))}
        </g>

        {/* Dots */}
        <g>
          {prepared.map((d, i) => (
            <circle
              key={`dot-${i}`}
              className="dot"
              cx={xScale(d.x)}
              cy={yScale(d.y)}
              r={3}
              fill={colorMap[d.c] || '#8884d8'}
            >
              <title>{`${xKey}: ${d.x}\n${yKey}: ${d.y}\n${cKey}: ${String(d.c)}`}</title>
            </circle>
          ))}
        </g>
      </svg>

      {/* Legend */}
      <div className="legend" role="list" aria-label="Legend">
        {categories.map((cat) => (
          <div className="legend-item" role="listitem" key={`leg-${String(cat)}`}>
            <span className="swatch" style={{ background: colorMap[cat] }} />
            <span title={String(cat)}>{String(cat)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTick(v) {
  if (!Number.isFinite(v)) return '';
  // adaptive formatting
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(2).replace(/\.00$/, '') + 'k';
  if (abs >= 1) return v.toFixed(2).replace(/\.00$/, '');
  return v.toPrecision(2);
}
