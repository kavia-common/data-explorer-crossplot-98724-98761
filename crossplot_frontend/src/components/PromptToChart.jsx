import React, { useEffect, useMemo, useState } from 'react';
import { interpretPrompt, getAiApiKey, setAiApiKey, getAiEndpointInfo } from '../services/aiInterpreter';

/**
 * PromptToChart
 * A small panel with a textarea for natural language instructions that are interpreted
 * into chart variable selections. Uses an AI service if an API key is present; otherwise,
 * falls back to a heuristic with clear messaging.
 *
 * Props:
 * - numericOptions: string[]
 * - categoricalOptions: string[]
 * - dateOptions?: string[]
 * - onApply: function({ x, y, color }) -> void
 * - disabled?: boolean
 */

// PUBLIC_INTERFACE
export default function PromptToChart({
  numericOptions = [],
  categoricalOptions = [],
  dateOptions = [],
  onApply,
  disabled = false
}) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [aiKey, setKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  // If LLM attempt fails with an auth error (e.g., 401), we surface a warning banner for the user.
  const [llmNotice, setLlmNotice] = useState('');
  const [endpoint, setEndpoint] = useState(null);

  useEffect(() => {
    setKey(getAiApiKey() || '');
    // Capture current AI endpoint info for debugging if needed
    try {
      setEndpoint(getAiEndpointInfo());
    } catch {
      // ignore
    }
  }, []);

  const hasAI = useMemo(() => !!aiKey, [aiKey]);
  const canInterpret = useMemo(() => {
    return !disabled && (numericOptions.length >= 2) && (categoricalOptions.length >= 1) && prompt.trim().length > 0;
  }, [disabled, numericOptions, categoricalOptions, prompt]);

  const helperText = useMemo(() => {
    if (numericOptions.length < 2 || categoricalOptions.length < 1) {
      return 'Se necesitan al menos dos numéricas y una categórica para graficar.';
    }
    return 'Nota: actualmente solo se soportan crossplots (scatterplots). Ejemplo: "Graficar precio vs cantidad, coloreado por categoría".';
  }, [numericOptions, categoricalOptions]);

  function validateResult(res) {
    const { x, y, color } = res || {};
    const validX = x && numericOptions.includes(x);
    const validY = y && numericOptions.includes(y);
    const validC = color && categoricalOptions.includes(color);
    return { validX, validY, validC };
  }

  async function handleInterpret() {
    if (!canInterpret) return;

    setStatus({ type: 'loading', message: 'Interpretando…' });
    try {
      const variables = {
        numeric: numericOptions,
        categorical: categoricalOptions,
        date: dateOptions
      };
      const res = await interpretPrompt({ prompt, variables, options: { preferLLM: true } });

      // If LLM was attempted but not used due to an error (e.g., 401), show a visible warning.
      const llmAuthIssue = res?.attemptedLLM && res?.source !== 'openai' && res?.llmError;
      setLlmNotice(llmAuthIssue ? String(res.llmError) : '');

      // 1) Unsupported chart type handling
      if (res?.unsupported || (res?.chart && res.chart !== 'scatter')) {
        const msg = [
          res?.error || 'Tipo de gráfico no soportado.',
          res?.suggestion || 'Actualmente solo se soportan crossplots (scatterplots).',
          'Ejemplos: "Precio vs Cantidad, coloreado por Categoría".'
        ].filter(Boolean).join(' ');
        setStatus({ type: 'error', message: msg });
        return;
      }

      // 2) Unknown variable error bubbled from interpreter
      if (res?.error && !res?.x && !res?.y) {
        setStatus({ type: 'error', message: res.error });
        return;
      }

      // 3) Standard validation for x, y, color
      const { validX, validY, validC } = validateResult(res);

      if (validX && validY && validC) {
        onApply && onApply({ x: res.x, y: res.y, color: res.color });
        const suffix = res.source === 'openai' ? '(IA)' : '(heurístico)';
        const llmNote = (res.source !== 'openai' && res?.attemptedLLM && res?.llmError)
          ? ` (fallo IA: ${res.llmError})` : '';
        setStatus({
          type: 'success',
          message: `Listo: x=${res.x}, y=${res.y}, color=${res.color} ${suffix}${llmNote}`
        });
      } else {
        const missing = [
          !validX ? `x inválido (${res?.x || 'n/a'})` : null,
          !validY ? `y inválido (${res?.y || 'n/a'})` : null,
          !validC ? `color inválido (${res?.color || 'n/a'})` : null
        ].filter(Boolean).join(', ');
        const extra = res?.explanation ? ` ${res.explanation}` : '';
        setStatus({
          type: 'error',
          message: `No se pudo aplicar: ${missing}. Asegúrate de pedir dos numéricas y una categórica válidas.${extra}`
        });
      }
    } catch (e) {
      setStatus({ type: 'error', message: e?.message || 'No se pudo interpretar el prompt.' });
    }
  }

  function handleSaveKey() {
    setAiApiKey(aiKey);
    setStatus({
      type: 'success',
      message: 'Clave de IA guardada localmente (navegador).'
    });
  }

  return (
    <div className="selector ai-card" aria-label="Prompt con IA">
      <h3 className="section-title">Prompt a Gráfica (IA)</h3>

      {/* AI key status */}
      {!hasAI ? (
        <div className="ai-warning" role="note">
          Para mejores resultados, agrega una clave de API de IA (OpenAI compatible).
          El sistema hará un intento heurístico si no hay clave.
          <div className="ai-key-row">
            {!showKeyInput ? (
              <button type="button" className="btn" onClick={() => setShowKeyInput(true)}>
                Configurar clave de IA
              </button>
            ) : (
              <>
                <input
                  type="password"
                  className="text-input"
                  placeholder="Pega tu clave de OpenAI (sk-...)"
                  value={aiKey}
                  onChange={(e) => setKey(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={handleSaveKey} disabled={!aiKey.trim()}>
                  Guardar clave
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="ai-ok" role="note">
          IA habilitada con clave en este navegador.
        </div>
      )}

      {/* LLM connection/authorization warning (e.g., 404, 401, CORS) */}
      {llmNotice ? (
        <div className="ai-warning" role="alert">
          <div><strong>Error de IA:</strong> {llmNotice}</div>
          {endpoint ? (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Endpoint actual: <code>{endpoint.fullUrl}</code>
              <br />
              Verifica tus variables de entorno:
              <ul style={{ margin: '6px 0 0 20px' }}>
                <li><code>REACT_APP_AI_BASE</code> o <code>REACT_APP_REACT_APP_AI_BASE</code> (sin <code>/v1</code> al final si usas <code>REACT_APP_OPENAI_CHAT_PATH=/v1/chat/completions</code>).</li>
                <li><code>REACT_APP_OPENAI_CHAT_PATH</code> (por defecto <code>/v1/chat/completions</code>).</li>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Variables available */}
      <div className="ai-vars">
        <div className="ai-vars-row">
          <span className="ai-vars-label">Numéricas:</span>
          <span className="ai-vars-list">{numericOptions.join(', ') || '(ninguna)'}</span>
        </div>
        <div className="ai-vars-row">
          <span className="ai-vars-label">Categóricas:</span>
          <span className="ai-vars-list">{categoricalOptions.join(', ') || '(ninguna)'}</span>
        </div>
      </div>

      {/* Prompt textarea */}
      <div className="row">
        <label htmlFor="aiPrompt">Instrucción</label>
        <textarea
          id="aiPrompt"
          className="text-area"
          placeholder='Ej: "Graficar precio vs cantidad, coloreado por categoría"'
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled}
        />
        <div className="helper">{helperText}</div>
      </div>

      <div className="token-actions">
        <button className="btn btn-primary" type="button" onClick={handleInterpret} disabled={!canInterpret}>
          Interpretar
        </button>
      </div>

      {/* Status area */}
      {status.type === 'loading' && <div className="loading" aria-live="polite">{status.message}</div>}
      {status.type === 'success' && <div className="success" aria-live="polite">{status.message}</div>}
      {status.type === 'error' && <div className="error" aria-live="assertive">{status.message}</div>}
    </div>
  );
}
