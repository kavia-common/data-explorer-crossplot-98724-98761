//
//
// AI Interpreter service
// Translates a natural language prompt into chart instructions (x, y, color)
// using an LLM (OpenAI) if an API key is available; otherwise, falls back to a
// lightweight heuristic parser using available variable names.
//
// Improvements in this version:
// - Explicit attempt to call OpenAI when an API key is present.
// - Configurable base URL and path (REACT_APP_OPENAI_BASE_URL, REACT_APP_OPENAI_CHAT_PATH).
// - Timeout and robust error classification.
// - Automatic retry without JSON mode if the model does not support response_format.
// - Clear "attemptedLLM" and "llmError" fields in the result for UI transparency.
//

/**
 * Types:
 * - VariablesContext = { numeric: string[], categorical: string[], date?: string[] }
 * - InterpretResult = {
 *     x?: string, y?: string, color?: string, chart?: string,
 *     source: 'openai'|'heuristic'|'validator',
 *     explanation?: string,
 *     attemptedLLM?: boolean,
 *     llmError?: string
 *   }
 */

const OPENAI_BASE_URL = process.env.REACT_APP_OPENAI_BASE_URL || 'https://api.openai.com';
const OPENAI_CHAT_PATH = process.env.REACT_APP_OPENAI_CHAT_PATH || '/v1/chat/completions';
const OPENAI_URL = `${OPENAI_BASE_URL.replace(/\/$/, '')}${OPENAI_CHAT_PATH.startsWith('/') ? '' : '/'}${OPENAI_CHAT_PATH}`;
const DEFAULT_MODEL = process.env.REACT_APP_OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Build a system prompt to instruct the model to output compact JSON instructions:
 * {
 *   "x": "<numericVar>",
 *   "y": "<numericVar>",
 *   "color": "<categoricalVar>",
 *   "chart": "scatter"
 * }
 */
function buildSystemPrompt(variables) {
  const { numeric = [], categorical = [], date = [] } = variables || {};
  return [
    'You translate user chart intents into a strict JSON instruction for a scatter plot.',
    'Respond ONLY with a single JSON object and no prose.',
    'Pick variable names from the provided lists exactly as written.',
    'Output keys: x (numeric), y (numeric), color (categorical), chart (always "scatter").',
    '',
    `Available numeric variables: ${numeric.join(', ') || '(none)'}`,
    `Available categorical variables: ${categorical.join(', ') || '(none)'}`,
    `Available date variables: ${date.join(', ') || '(none)'} (not required for scatter, ignore unless asked to facet/time isn't supported)`,
    '',
    'Examples:',
    'User: "Plot income vs age, colored by region"',
    'Assistant: {"x":"age","y":"income","color":"region","chart":"scatter"}',
    '',
    'If the request is impossible with given variables, choose the closest valid combination and reflect that in the choice.'
  ].join('\n');
}

/**
 * Try to parse JSON content safely. Accepts fenced code blocks.
 */
function safeParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  // Remove code fences if present
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(s);
  } catch {
    // attempt to extract the first {...} block
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const inner = s.slice(start, end + 1);
      try { return JSON.parse(inner); } catch { /* ignore */ }
    }
  }
  return null;
}

/**
 * Heuristic interpretation based on variable name matching and common phrases.
 * Includes stricter handling to avoid misleading defaults when the user names
 * variables that do not exist.
 */
function heuristicInterpretation(prompt, variables) {
  const { numeric = [], categorical = [] } = variables || {};
  const text = (prompt || '').toLowerCase();

  // Helper: exact match by case-insensitive comparison (preserve spaces)
  const exactLowerList = (arr) => (arr || []).map(v => String(v).toLowerCase());
  const numericsLower = exactLowerList(numeric);
  const catsLower = exactLowerList(categorical);
  const findExact = (name, list, listLower) => {
    const idx = listLower.indexOf(String(name).toLowerCase());
    return idx >= 0 ? list[idx] : null;
  };

  // Try to find numeric variables mentioned in the prompt
  const mentionedNumerics = numeric.filter(n => text.includes(String(n).toLowerCase()));
  // Try to find categorical variables mentioned in the prompt
  const mentionedCats = categorical.filter(c => text.includes(String(c).toLowerCase()));

  // Extract explicit "variable <name>" patterns (Spanish and English)
  // Capture one or two tokens after the keyword to allow cases like "oil acumulado"
  const explicitVarMatches = [];
  const varRegexes = [
    /(de\s+la\s+)?variable\s+([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)/gi,
    /(de\s+la\s+)?columna\s+([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)/gi,
    /(del\s+)?campo\s+([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)/gi,
    /(de\s+la\s+)?atributo\s+([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)?)/gi
  ];
  for (const rx of varRegexes) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const name = (m[2] || '').trim();
      if (name) explicitVarMatches.push(name);
    }
  }

  // Build initial guesses
  let x = mentionedNumerics[0] || numeric[0];
  let y = mentionedNumerics[1] || numeric[1] || numeric[0];

  // Guess color by phrases: "color by", "colorear por", "según", "por"
  let color = mentionedCats[0] || categorical[0];

  // Attempt to detect "vs" ordering like "A vs B" or "A contra B"
  const vsMatch = text.match(/([a-zA-Z0-9_]+)\s*(vs|contra)\s*([a-zA-Z0-9_]+)/i);
  if (vsMatch) {
    const left = vsMatch[1];
    const right = vsMatch[3];
    if (numericsLower.includes(left.toLowerCase())) x = findExact(left, numeric, numericsLower);
    if (numericsLower.includes(right.toLowerCase())) y = findExact(right, numeric, numericsLower);
  }

  // Try phrases "on x", "on y"
  const onX = text.match(/en\s+el\s+eje\s+x\s+([a-zA-Z0-9_]+)/i) || text.match(/on\s+x\s+axis\s+([a-zA-Z0-9_]+)/i);
  if (onX && onX[1] && numericsLower.includes(onX[1].toLowerCase())) x = findExact(onX[1], numeric, numericsLower);

  const onY = text.match(/en\s+el\s+eje\s+y\s+([a-zA-Z0-9_]+)/i) || text.match(/on\s+y\s+axis\s+([a-zA-Z0-9_]+)/i);
  if (onY && onY[1] && numericsLower.includes(onY[1].toLowerCase())) y = findExact(onY[1], numeric, numericsLower);

  // Try "color by X" or "colorear por X" or "color por X" or "según X" or "por X"
  const colorBy = text.match(/color(?:ed)?\s+by\s+([a-zA-Z0-9_]+)/i)
               || text.match(/colorear\s+por\s+([a-zA-Z0-9_]+)/i)
               || text.match(/color\s+por\s+([a-zA-Z0-9_]+)/i)
               || text.match(/seg[uú]n\s+([a-zA-Z0-9_]+)/i)
               || text.match(/por\s+([a-zA-Z0-9_]+)/i);
  if (colorBy && colorBy[1] && catsLower.includes(colorBy[1].toLowerCase())) {
    color = findExact(colorBy[1], categorical, catsLower);
  }

  // If the prompt explicitly referenced a variable name that we can't find,
  // avoid misleading defaults and surface a user-friendly error.
  const unknownVars = [];
  for (const name of explicitVarMatches) {
    const found = numericsLower.includes(name.toLowerCase()) || catsLower.includes(name.toLowerCase());
    if (!found) unknownVars.push(name);
  }

  const explanation = 'Interpreted locally by keyword and variable name matching.';
  if (unknownVars.length > 0) {
    return {
      chart: 'scatter',
      source: 'heuristic',
      explanation,
      error: `No se encontraron en el dataset las variables solicitadas: ${unknownVars.join(', ')}.`,
    };
  }

  return { x, y, color, chart: 'scatter', source: 'heuristic', explanation };
}

/**
 * Fetch helper with timeout using AbortController.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, mode: 'cors' });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Classify OpenAI error text into a shorter, user-friendly reason.
 */
function classifyOpenAIError(status, errText) {
  const text = String(errText || '').toLowerCase();
  if (status === 401 || text.includes('invalid api key') || text.includes('incorrect api key')) {
    return 'API key inválida o no autorizada (401).';
  }
  if (status === 404) {
    return 'Endpoint de OpenAI no encontrado (404).';
  }
  if (status === 429 || text.includes('rate limit')) {
    return 'Límite de uso de la API excedido (429).';
  }
  if (status === 400 && (text.includes('response_format') || text.includes('json') || text.includes('not supported'))) {
    return 'El modelo no soporta JSON mode; reintentando sin JSON mode.';
  }
  if (text.includes('cors') || text.includes('failed to fetch') || text.includes('network')) {
    return 'Error de red/CORS al contactar OpenAI.';
  }
  return `OpenAI error ${status}: ${errText || 'desconocido'}`;
}

/**
 * Call OpenAI Chat Completions with a constrained instruction.
 * Tries JSON mode first; if unsupported, retries without response_format.
 */
async function callOpenAI(prompt, variables, apiKey, model) {
  const sys = buildSystemPrompt(variables);
  const modelToUse = model || DEFAULT_MODEL;

  // First attempt: JSON mode
  const payloadJsonMode = {
    model: modelToUse,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: String(prompt || '').trim() }
    ],
    temperature: 0.0,
    response_format: { type: 'json_object' }
  };

  const baseHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  let res;
  try {
    res = await fetchWithTimeout(OPENAI_URL, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(payloadJsonMode)
    });
  } catch (e) {
    // network/timeout/CORS
    throw new Error('Error de red o CORS al contactar OpenAI.');
  }

  // If OK -> parse and return
  if (res.ok) {
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = safeParseJson(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('No se pudo parsear la respuesta del modelo como JSON.');
    }
    return {
      x: parsed.x,
      y: parsed.y,
      color: parsed.color,
      chart: parsed.chart || 'scatter',
      source: 'openai',
      explanation: 'Interpreted by OpenAI based on provided variable context.',
      attemptedLLM: true
    };
  }

  // If not OK, inspect text
  const errText = await res.text().catch(() => '');
  const classified = classifyOpenAIError(res.status, errText);

  // Retry logic: model may not support JSON mode -> try without response_format
  if (res.status === 400 && classified.includes('no soporta JSON mode')) {
    const payloadNoJsonMode = {
      model: modelToUse,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(prompt || '').trim() }
      ],
      temperature: 0.0
    };

    let res2;
    try {
      res2 = await fetchWithTimeout(OPENAI_URL, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify(payloadNoJsonMode)
      });
    } catch (e) {
      throw new Error('Error de red o CORS al contactar OpenAI (reintento sin JSON mode).');
    }

    if (!res2.ok) {
      const errText2 = await res2.text().catch(() => '');
      throw new Error(classifyOpenAIError(res2.status, errText2));
    }

    const data2 = await res2.json();
    const content2 = data2?.choices?.[0]?.message?.content || '';
    const parsed2 = safeParseJson(content2);
    if (!parsed2 || typeof parsed2 !== 'object') {
      throw new Error('No se pudo parsear la respuesta del modelo como JSON (sin JSON mode).');
    }
    return {
      x: parsed2.x,
      y: parsed2.y,
      color: parsed2.color,
      chart: parsed2.chart || 'scatter',
      source: 'openai',
      explanation: 'Interpreted by OpenAI (sin JSON mode) based on provided variable context.',
      attemptedLLM: true
    };
  }

  // Other errors -> propagate as Error for the caller to fallback
  throw new Error(classified);
}

/**
 * Return the AI API key from localStorage or environment variables.
 */
// PUBLIC_INTERFACE
export function getAiApiKey() {
  try {
    return (
      (typeof localStorage !== 'undefined' && localStorage.getItem('aiApiKey')) ||
      process.env.REACT_APP_OPENAI_API_KEY ||
      process.env.REACT_APP_AI_API_KEY ||
      ''
    );
  } catch {
    // In some environments accessing localStorage can throw; ignore and fallback to env only.
    return process.env.REACT_APP_OPENAI_API_KEY || process.env.REACT_APP_AI_API_KEY || '';
  }
}

/**
 * Store or clear the AI API key in localStorage.
 */
// PUBLIC_INTERFACE
export function setAiApiKey(key) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (key && key.trim()) {
      localStorage.setItem('aiApiKey', key.trim());
    } else {
      localStorage.removeItem('aiApiKey');
    }
  } catch {
    // ignore storage failure
  }
}

/**
 * Detect the chart intent from the natural language prompt (basic keywords).
 * Returns one of: 'scatter' | 'histogram' | 'bar' | 'line' | 'box' | 'unknown'
 */
function detectChartIntent(prompt) {
  const t = String(prompt || '').toLowerCase();

  // Spanish and English keywords
  const isHistogram = /(histograma|histogram)\b/.test(t);
  const isBar = /\b(bar|barras|barra)\b/.test(t);
  const isLine = /\b(line|línea|linea)\b/.test(t);
  const isBox = /\b(caja|box\s*plot|boxplot)\b/.test(t);

  // Scatter/crossplot indicators
  const isScatter = /\b(scatter|dispersion|dispersión|cross\s*plot|crossplot|vs|contra)\b/.test(t);

  if (isHistogram) return 'histogram';
  if (isBar) return 'bar';
  if (isLine) return 'line';
  if (isBox) return 'box';
  if (isScatter) return 'scatter';
  return 'unknown';
}

/**
 * Interpret a user's prompt into chart instructions.
 * Will use OpenAI if an API key is available; otherwise, a heuristic fallback.
 *
 * Params:
 * - prompt: string
 * - variables: { numeric: string[], categorical: string[], date?: string[] }
 * - options: { preferLLM?: boolean, model?: string }
 *
 * Returns InterpretResult or an object with { unsupported: true, requestedChart, suggestion, error }
 */
// PUBLIC_INTERFACE
export async function interpretPrompt({ prompt, variables, options = {} }) {
  const apiKey = getAiApiKey();
  const preferLLM = options.preferLLM !== false; // default true

  // Pre-validate intent: currently only support scatter/crossplots
  const intent = detectChartIntent(prompt);
  if (intent && intent !== 'unknown' && intent !== 'scatter') {
    return {
      source: 'validator',
      chart: intent,
      unsupported: true,
      requestedChart: intent,
      error: `Este tipo de gráfico no está soportado: ${intent}.`,
      suggestion:
        'Actualmente solo se soportan crossplots (scatterplots). Sugerencia: "Grafica X vs Y, coloreado por Categórica".',
      attemptedLLM: false
    };
  }

  if (preferLLM && apiKey) {
    try {
      const r = await callOpenAI(prompt, variables, apiKey, options.model);
      return r;
    } catch (e) {
      // Fall back to heuristic with the error noted
      const h = heuristicInterpretation(prompt, variables);
      h.explanation = `LLM failed (${e?.message || 'unknown'}). Fallback to heuristic.`;
      h.attemptedLLM = true;
      h.llmError = e?.message || 'unknown';
      return h;
    }
  }

  // No API key or LLM not preferred -> deterministic heuristic
  const h = heuristicInterpretation(prompt, variables);
  h.attemptedLLM = false;
  return h;
}
