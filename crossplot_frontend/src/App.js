import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import Header from './components/Header';
import VariableSelector from './components/VariableSelector';
import ScatterPlot from './components/ScatterPlot';
import TokenGate from './components/TokenGate';
import PromptToChart from './components/PromptToChart';
import { fetchTableData } from './services/api';
import { inferVariableTypes, normalizeTable } from './utils/data';

/**
 * App shell that composes the layout, handles token gating, data fetching,
 * variable type detection, and coordinates state for the scatter plot visualization.
 */

// PUBLIC_INTERFACE
export default function App() {
  /** Token handling: state + localStorage */
  const [token, setToken] = useState(() => localStorage.getItem('apiToken') || '');

  /** State: loading/error/data */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);

  /** State: inferred variables */
  const [numericVars, setNumericVars] = useState([]);
  const [categoricalVars, setCategoricalVars] = useState([]);
  const [dateVars, setDateVars] = useState([]);

  /** State: selections */
  const [xVar, setXVar] = useState('');
  const [yVar, setYVar] = useState('');
  const [cVar, setCVar] = useState('');

  /** Helpers for display */
  function maskToken(t) {
    if (!t) return '';
    const s = String(t);
    if (s.length <= 4) return '••••';
    return '••••' + s.slice(-4);
  }

  // Fetch data only when token is present
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function load() {
      // If no token, clear state and skip fetch
      if (!token) {
        setRows([]);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const data = await fetchTableData(token, { signal: controller.signal });
        const normalized = normalizeTable(data);

        if (!Array.isArray(normalized) || normalized.length === 0) {
          throw new Error('The API response did not contain a non-empty array of row objects.');
        }
        const objectRows = normalized.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
        if (!objectRows.length) {
          throw new Error('The API response rows are not objects with key-value pairs.');
        }

        if (!isMounted) return;
        setRows(objectRows);

        const inferred = inferVariableTypes(objectRows);
        if (!isMounted) return;

        setNumericVars(inferred.numeric);
        setCategoricalVars(inferred.categorical);
        setDateVars(inferred.date);

        // Initialize defaults
        if (inferred.numeric.length > 0) {
          setXVar(inferred.numeric[0] || '');
          setYVar(inferred.numeric[1] || inferred.numeric[0] || '');
        }
        if (inferred.categorical.length > 0) {
          setCVar(inferred.categorical[0] || '');
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to fetch data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [token]);

  // Derived flags
  const hasEnoughVars = useMemo(() => {
    return numericVars.length >= 2 && categoricalVars.length >= 1;
  }, [numericVars, categoricalVars]);

  // Token handlers
  const handleSaveToken = (newToken) => {
    localStorage.setItem('apiToken', newToken);
    setToken(newToken);
  };

  const handleClearToken = () => {
    localStorage.removeItem('apiToken');
    setToken('');
    setRows([]);
    setError('');
  };

  return (
    <div className="app-root">
      <Header title="Crossplot Explorer" subtitle="Explore relationships using a color-coded scatterplot" />
      <div className="app-layout">
        <aside className="sidebar">
          {/* Detected variables moved to the top */}
          <div className="sidebar-section">
            <h3 className="section-title">Detected Variables</h3>
            <div className="detected-list">
              <div className="detected-item">
                <span className="badge badge-primary">{numericVars.length}</span>
                <span>Numeric</span>
              </div>
              <div className="detected-item">
                <span className="badge badge-secondary">{categoricalVars.length}</span>
                <span>Categorical</span>
              </div>
              <div className="detected-item">
                <span className="badge badge-accent">{dateVars.length}</span>
                <span>Date</span>
              </div>
            </div>
            {/* Row count displayed here, just under Detected Variables */}
            {!loading && !error && rows.length > 0 && (
              <div className="rows-counter">
                {rows.length.toLocaleString()} rows loaded
              </div>
            )}
          </div>

          {/* PromptToChart added above the manual selector */}
          <PromptToChart
            numericOptions={numericVars}
            categoricalOptions={categoricalVars}
            dateOptions={dateVars}
            onApply={({ x, y, color }) => {
              if (x && numericVars.includes(x)) setXVar(x);
              if (y && numericVars.includes(y)) setYVar(y);
              if (color && categoricalVars.includes(color)) setCVar(color);
            }}
            disabled={!rows.length || !hasEnoughVars}
          />

          {/* Variable selector next, as requested */}
          <VariableSelector
            numericOptions={numericVars}
            categoricalOptions={categoricalVars}
            xVar={xVar}
            yVar={yVar}
            cVar={cVar}
            onXChange={setXVar}
            onYChange={setYVar}
            onCChange={setCVar}
            disabled={!rows.length || !hasEnoughVars}
          />

          {!hasEnoughVars && (
            <div className="helper">
              Need at least two numeric variables and one categorical variable. Check your dataset.
            </div>
          )}
        </aside>

        <main className="main-content">
          {!token ? (
            <div className="placeholder">
              Please enter your access token to load the dataset.
            </div>
          ) : !loading && !error && rows.length > 0 && hasEnoughVars && xVar && yVar && cVar ? (
            <div className="viz-card">
              <div className="viz-header">
                <div className="viz-title">
                  Scatterplot: {xVar} vs {yVar}
                </div>
                <div className="viz-subtitle">
                  Colored by {cVar}
                </div>
              </div>
              <ScatterPlot
                data={rows}
                xKey={xVar}
                yKey={yVar}
                cKey={cVar}
                width={960}
                height={560}
              />
            </div>
          ) : (
            <div className="placeholder">
              {loading ? 'Fetching data…' : (error ? 'Fix the configuration or try again.' : 'Choose variables to render the crossplot.')}
            </div>
          )}
        </main>
      </div>

      {/* DATA SOURCE moved to the bottom, below the visualization */}
      <section className="data-source-panel" aria-label="Data Source">
        <div className="data-source-card">
          <h3 className="section-title">Data Source</h3>

          {/* API Endpoint removed per instructions */}

          <div className="info-card">
            <div className="label">Token</div>
            <div className="value">{token ? maskToken(token) : '(none)'}</div>
          </div>

          {loading && <div className="loading">Loading dataset…</div>}
          {!loading && error && <div className="error">{error}</div>}

          <TokenGate token={token} onSave={handleSaveToken} onClear={handleClearToken} />
        </div>
      </section>

      <footer className="footer">
        <span>Powered by React • Modern Light Theme</span>
      </footer>
    </div>
  );
}
