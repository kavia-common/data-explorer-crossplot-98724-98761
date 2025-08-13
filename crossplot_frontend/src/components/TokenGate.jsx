import React, { useEffect, useState } from 'react';

/**
 * TokenGate provides a simple UI to input an access token, save it to localStorage via parent,
 * and clear it if needed.
 * 
 * Props:
 * - token: string | current token value (for display)
 * - onSave: function(newToken: string) -> void
 * - onClear: function() -> void
 */

// PUBLIC_INTERFACE
export default function TokenGate({ token = '', onSave, onClear }) {
  const [value, setValue] = useState(token || '');

  useEffect(() => {
    setValue(token || '');
  }, [token]);

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = (value || '').trim();
    if (!trimmed) return;
    onSave && onSave(trimmed);
  };

  const handleClear = (e) => {
    e.preventDefault();
    onClear && onClear();
  };

  return (
    <div className="selector" aria-label="Access Token">
      <h3 className="section-title">Access Token</h3>
      <form onSubmit={handleSave}>
        <div className="row">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            className="text-input"
            type="text"
            placeholder="Enter your access token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
        </div>
        <div className="token-actions">
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            Save token
          </button>
          <button type="button" className="btn" onClick={handleClear} disabled={!token}>
            Clear token
          </button>
        </div>
      </form>
    </div>
  );
}
