//
//
// API service for fetching JSON table with tokenized URL
//

/**
 * API functions to build the endpoint URL and fetch data from the remote service.
 * The endpoint pattern is:
 *   https://api.synergies.ar/synergies/digest.json?limit=10000&offset=0&token=<userToken>
 * 
 * Configuration:
 * - Optional base URL can be set via REACT_APP_API_BASE, defaults to https://api.synergies.ar
 * 
 * Usage:
 *   const url = buildApiUrl(userToken, { limit: 10000, offset: 0 });
 *   const data = await fetchTableData(userToken);
 */

// PUBLIC_INTERFACE
export function buildApiUrl(token, { limit = 10000, offset = 0, base } = {}) {
  /** Build the API URL with the given token and optional pagination parameters. */
  if (!token) {
    throw new Error('Access token is required to build the API URL.');
  }
  const baseUrl = base || process.env.REACT_APP_API_BASE || 'https://api.synergies.ar';
  const path = '/synergies/digest.json';
  const url = new URL(path, baseUrl);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('token', token);
  return url.toString();
}

// PUBLIC_INTERFACE
export async function fetchTableData(token, { signal, limit = 10000, offset = 0, base } = {}) {
  /**
   * Fetch table data from the API using the provided access token.
   * 
   * Params:
   * - token: string. Access token to include in the query string.
   * - signal: AbortSignal (optional). Used to cancel the request.
   * - limit: number (optional). Defaults to 10000.
   * - offset: number (optional). Defaults to 0.
   * - base: string (optional). Base URL override. Defaults to REACT_APP_API_BASE or https://api.synergies.ar.
   * 
   * Returns:
   * - Parsed JSON response body.
   */
  if (!token) {
    throw new Error('Access token is required.');
  }
  const url = buildApiUrl(token, { limit, offset, base });
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}
