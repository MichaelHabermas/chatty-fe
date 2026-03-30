# Chatty — feature log

Only the coolest features are outlined here.

## Prefetch web search (Tavily)

### Added

- Tavily runs **before** Groq; results are injected as a **system** message; streaming path is otherwise unchanged.
- Toggle via **`web_search`** / header **`X-Chatty-Web-Search`**; **`web_search_mode`** **auto** \| **on** \| **off** (heuristics, optional Groq JSON router when **`GROQ_WEB_SEARCH_ROUTER_MODEL`** is set and the signal is ambiguous).
- **`web_sources`** on JSON responses; SSE emits **`event: chatty.web_sources`** first, then normal completion chunks.

### Why

Live grounding **without** a tool loop inside Chatty; **`web_sources`** gives citations and auditability without scraping the assistant text.

### Docs

Backend env and edge cases: `CLAUDE.md` in the Chatty server repo.

---

## Agent-shaped `/v1/chat/completions`

### Added

Forwards **`tools`**, **`tool_choice`**, **`parallel_tool_calls`**, **`response_format`**, and OpenAI-shaped **`messages`** (dicts, not only role/string content) to Groq.

### Why

The official OpenAI SDK expects tool calls, structured output, and multi-turn tool result messages — a strict role/content-only proxy breaks real agents.

### Docs

Clients should still send only the supported subset; extras can make Groq error.

---

## Telemetry time travel (chatty-fe)

### Added

Per assistant turn stores a **telemetry snapshot** (model, latency, tokens, cost, web-source count, ids, settings). **Click a message** to replay that snapshot in the Telemetry sidebar; **latest** turn or a **new message** returns to live metrics. Thread + selection persisted in **`localStorage`** (`chatty.fe.thread.v1`).

### Why

The sidebar matches **the turn you’re reading**, not only the latest reply.

### Docs

`js/telemetry/`, `js/storage/`, `js/ui/metricsView.js`, `js/ui/chatView.js`.

---

## Debug bundle (chatty-fe)

### Added

**Copy debug bundle** in the Telemetry header copies a **Markdown** snippet to the clipboard: redacted JSON (backend origin + path, `request_body` matching the client payload shape, full telemetry snapshot for the **selected or latest** completed turn), a **`body.json`** block for safe `curl`, and a **`curl`** example using `YOUR_API_KEY` and `--data-binary @body.json`. Disabled while streaming or when there is no completed assistant snapshot.

### Why

Paste-ready repro material for **chatty-be** issues without exposing secrets or retyping CORS notes.

### Docs

`js/telemetry/debugBundle.js`, `js/main.js`.

---

## Session spend trajectory (chatty-fe)

### Added

Under **Session total**, a **Spend trajectory** strip plots **cumulative** session USD after each **completed** assistant turn (same counting rules as cost: only turns with a countable `resolution`). Hidden when there are no completed turns. Recomputes whenever telemetry view refreshes.

### Why

You see the **shape** of spend across the conversation, not only the final session total.

### Docs

`js/telemetry/sessionCostSeries.js`, `js/ui/metricsView.js`.

---

## Turn compare (chatty-fe)

### Added

**Shift+click** an assistant reply to mark the **first** turn, then **Shift+click** another to open **Turn compare**: a table of **First** vs **Second** with **Δ** for cost, latency, tokens, and web-source count (plus model, Server-Timing rows, truncated request ids). The main Telemetry block reflects the **first** turn. **Clear** on the panel, **Esc** (when the chat input is not focused), or a **normal click** on a reply exits compare. New sends clear compare state. Left/right bubbles use distinct highlights.

### Why

See **what changed** between two completions without pasting two debug bundles.

### Docs

`js/telemetry/telemetryDiff.js`, `js/ui/metricsView.js`, `js/ui/chatView.js`, `js/main.js`.
