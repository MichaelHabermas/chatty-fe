# chatty-fe

Vanilla HTML/CSS/JS UI for [chatty-be](https://github.com/MichaelHabermas/chatty-be), calling `POST /v1/chat/completions` on the configured base URL.

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
