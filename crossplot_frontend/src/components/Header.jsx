import React from 'react';

/**
 * Header component showing the app title and a brief subtitle.
 * It is styled via App.css and stays sticky at the top.
 */

// PUBLIC_INTERFACE
export default function Header({ title, subtitle }) {
  return (
    <header className="header" role="banner">
      <div className="header-inner">
        <div className="brand" aria-label="Application Branding">
          <div className="brand-logo" aria-hidden="true" />
          <div className="brand-text">
            <div className="brand-title">{title}</div>
            {subtitle ? <div className="brand-subtitle">{subtitle}</div> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
