# chatty-fe — agent memory

## Learned User Preferences

- Telemetry and cost UI: keep the existing cyber-cockpit look (Outfit + IBM Plex Mono, cyan accents); treat cost as a separate concern from throughput (amber styling and clear labeling).

## Learned Workspace Facts

- Local development: run `node scripts/dev-server.mjs` so the static app and `/v1` API share an origin; the deployed Render backend typically does not send browser CORS headers on `POST`, so direct `fetch` from another origin often fails while `curl` works.
- On `localhost` / `127.0.0.1`, the default backend base URL is `window.location.origin` (e.g. `http://localhost:8787`) to align with that proxy.
- Metrics sidebar: `Server-Timing` name `groq` maps to Processing; `groq-ttfb` maps to Response (if `groq-ttfb` is absent, Response stays empty). `X-Groq-Request-Id` may be unreadable from JavaScript on cross-origin responses unless exposed via CORS.
- Cost observability: prefer `X-Chatty-Cost-Usd` (or numeric cost fields on `usage`); otherwise the client estimates USD from token usage using `js/pricing/` Groq rate tables.
