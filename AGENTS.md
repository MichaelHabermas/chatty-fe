# chatty-fe — agent memory

## Learned User Preferences

- Telemetry and cost UI: keep the existing cyber-cockpit look (Outfit + IBM Plex Mono, cyan accents); treat cost as a separate concern from throughput (amber styling and clear labeling).
- `FEATURES.md` / feature logs: keep **Added / Why / Docs** (and `---` between sections), but stay lean; skip table-stakes proxy wiring (e.g. CORS-only narratives, generic ops hooks) unless the user asks to document it.
- Metrics panel: avoid layout jump when switching between live (latest) and past-reply inspection; reserve stable space for the view label so the column does not reflow.

## Learned Workspace Facts

- Assistant replies render Markdown to sanitized HTML (`js/render/markdownToSafeHtml.js`); user bubbles stay plain text.
- Local development: run `node scripts/dev-server.mjs` so the static app and `/v1` API share an origin; the deployed Render backend typically does not send browser CORS headers on `POST`, so direct `fetch` from another origin often fails while `curl` works.
- On `localhost` / `127.0.0.1`, the default backend base URL is `window.location.origin` (e.g. `http://localhost:8787`) to align with that proxy.
- Metrics sidebar: `Server-Timing` name `groq` maps to Processing; `groq-ttfb` maps to Response (if `groq-ttfb` is absent, Response stays empty). `X-Groq-Request-Id` may be unreadable from JavaScript on cross-origin responses unless exposed via CORS.
- Cost observability: prefer `X-Chatty-Cost-Usd` (or numeric cost fields on `usage`); otherwise the client estimates USD from token usage using `js/pricing/` Groq rate tables.
