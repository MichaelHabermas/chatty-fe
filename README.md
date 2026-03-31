# chatty-fe

Vanilla HTML/CSS/JS **AI proxy cockpit** for [chatty-be](https://github.com/MichaelHabermas/chatty-be). The UI calls `POST /v1/chat/completions` on the configured base URL and surfaces latency, tokens, cost, web search, and per-turn quality in a dedicated Telemetry panel.

## Highlights

- **Same-origin dev server** — avoids browser CORS issues when the deployed API does not expose `POST` to arbitrary origins (see below).
- **Telemetry** — per-assistant-turn metrics, click-to-inspect, turn compare (Shift+click two replies), spend trajectory, debug bundle copy, optional resonance (“keep this”) and session **emotional weather**.
- **Quality** — rate replies 1–5, see **Quality by Setting** (model / web search / streaming), optional **Apply** recommendations, and lightweight **input coaching** from your ratings.
- **Rendering** — assistant messages render as **Markdown** (sanitized HTML).

A fuller, implementation-oriented list lives in [FEATURES.md](FEATURES.md).

## Why the dev server?

The public Render deployment does not send browser CORS headers, so **calling the API directly from `http://localhost` or `file://` usually fails** with “Failed to fetch”. Run the included proxy so the page and `/v1` share the same origin.

## Run locally (recommended)

```bash
node scripts/dev-server.mjs
```

Open [http://localhost:8787](http://localhost:8787). On first load, settings default the **Backend URL** to `http://localhost:8787` (same origin as the proxy). Optional: set `CHATTY_UPSTREAM` if you want to point the proxy at another backend.

```bash
CHATTY_UPSTREAM=http://localhost:8000 node scripts/dev-server.mjs
```

## Deployed backend

Default production API: [https://chatty-be-is9h.onrender.com/](https://chatty-be-is9h.onrender.com/) — use **Settings** only if you host the frontend on the **same origin** as the API, or after adding CORS on the server.

## Settings

- **Backend URL** — origin only (no trailing slash), e.g. `http://localhost:8787`
- **API Key** — optional `CHATTY_API_KEY` bearer token when the backend requires auth
- **Web search mode** — `auto` / `on` / `off` (see backend docs)
- **Streaming** — SSE token streaming when enabled

## Cost display

The client prefers server-reported USD (e.g. `X-Chatty-Cost-Usd` or numeric fields on `usage`); otherwise it **estimates** from token counts using Groq rate tables in `js/pricing/`. See Telemetry for last-turn cost, session total, and optional prompt/completion breakdown when estimated.
