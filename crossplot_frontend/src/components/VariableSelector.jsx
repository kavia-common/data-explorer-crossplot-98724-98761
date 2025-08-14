import React from 'react';
import { isArithmeticExpression } from '../utils/expression';

/**
 * VariableSelector renders dropdowns for X, Y (numeric) and Category (categorical) selections.
 * Disabled state is supported when data is not ready.
 */

// PUBLIC_INTERFACE
export default function VariableSelector({
  numericOptions = [],
  categoricalOptions = [],
  xVar,
  yVar,
  cVar,
  onXChange,
  onYChange,
  onCChange,
  disabled = false
}) {
  return (
    <div className="selector" aria-label="Variable Selector">
      <h3 className="section-title">Select Variables</h3>

      <div className="row">
        <label htmlFor="xVar">X Variable (numeric)</label>
        <select
          id="xVar"
          value={xVar || ''}
          onChange={(e) => onXChange && onXChange(e.target.value)}
          disabled={disabled || numericOptions.length < 1}
        >
          {numericOptions.length === 0 ? <option value="">No numeric variables</option> : null}
          {numericOptions.map((opt) => (
            <option key={`x-${opt}`} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <label htmlFor="yVar">Y Variable (numeric)</label>
        <select
          id="yVar"
          value={yVar || ''}
          onChange={(e) => onYChange && onYChange(e.target.value)}
          disabled={disabled || numericOptions.length < 1}
        >
          {numericOptions.length === 0 ? <option value="">No numeric variables</option> : null}
          {/* If current yVar is an arithmetic expression and not in numeric options, show it explicitly */}
          {yVar && !numericOptions.includes(yVar) && isArithmeticExpression(yVar) ? (
            <option key="y-expr" value={yVar}>{yVar} (expr)</option>
          ) : null}
          {numericOptions.map((opt) => (
            <option key={`y-${opt}`} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <label htmlFor="cVar">Category (categorical)</label>
        <select
          id="cVar"
          value={cVar || ''}
          onChange={(e) => onCChange && onCChange(e.target.value)}
          disabled={disabled || categoricalOptions.length < 1}
        >
          {categoricalOptions.length === 0 ? <option value="">No categorical variables</option> : null}
          {categoricalOptions.map((opt) => (
            <option key={`c-${opt}`} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
