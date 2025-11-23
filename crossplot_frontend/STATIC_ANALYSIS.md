Static Analysis Guide

Commands to run locally:
- Install deps:
  npm ci --no-audit --no-fund
- Lint:
  npx eslint . -f stylish
- Format check:
  npx prettier --check .
- Security audit:
  npm audit --production

Notes:
- ESLint config declares browser/jest globals to avoid no-undef false positives for fetch, localStorage, AbortController, URL, etc.
- Prettier config is included (.prettierrc.json). To format:
  npx prettier --write .
- Many audit findings are transitive from react-scripts@5.0.1. Consider migrating to Vite or modern alternatives for more complete remediation if overrides are insufficient.
