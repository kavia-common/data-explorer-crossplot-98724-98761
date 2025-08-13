//
// API service for fetching JSON table
//

/**
 * Fetch table data from the REACT_APP_API_URL endpoint.
 * Returns parsed JSON.
 *
 * Note: This function reads the API URL from process.env.REACT_APP_API_URL.
 * Ensure you set it in a .env file at the project root.
 */

// PUBLIC_INTERFACE
export async function fetchTableData({ signal } = {}) {
  const url = process.env.REACT_APP_API_URL;
  if (!url) {
    throw new Error('REACT_APP_API_URL is not configured.');
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}
