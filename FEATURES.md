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

While two turns are selected, an SVG **compare constellation** draws a curved path between the two bubbles (cyan/magenta gradient nodes) so the pair is visible in the scrollport.

### Why

See **what changed** between two completions without pasting two debug bundles.

### Docs

`js/telemetry/telemetryDiff.js`, `js/ui/compareConstellation.js`, `js/ui/metricsView.js`, `js/ui/chatView.js`, `js/main.js`, `index.html`, `css/components/chat.css`.

---

## Resonance Mode (chatty-fe)

### Added

Assistant replies now have a **Keep this** action that marks a turn as a kept moment. Kept replies get an amber afterglow in the thread, persist in **`localStorage`** with the rest of the thread state, and populate a **Resonance Mode** ribbon in the Telemetry sidebar. Clicking a kept moment in the ribbon jumps the sidebar back to that reply’s telemetry context.

### Why

Telemetry says what happened; resonance says **what mattered**. The session can now remember the replies worth revisiting, not just the replies with measurable stats.

### Docs

`index.html`, `js/main.js`, `js/state.js`, `js/storage/threadPersistence.js`, `js/ui/chatView.js`, `js/ui/metricsView.js`, `css/components/chat.css`, `css/components/metrics.css`.

---

## Emotional weather (chatty-fe)

### Added

The cockpit now derives a lightweight **session weather** state from assistant-turn quality and kept moments: **`neutral`**, **`lucid`**, **`ember`**, or **`storm`**. That state is applied on the root cockpit container and drives global CSS variables for ambient drift, tint, glow, and static, so the room subtly changes as the conversation changes.

### Why

The UI should feel like it has a memory of the session, not just a stack of isolated turns. Emotional weather gives the cockpit an evolving atmosphere without adding another dashboard widget.

### Docs

`index.html`, `js/main.js`, `css/tokens.css`, `css/base.css`, `css/layout.css`, `css/animations.css`.

---

## Quality ratings, insights, and coaching (chatty-fe)

### Added

- **1–5 quality rating** on assistant turns (inline control); ratings persist with the thread in **`localStorage`** and feed the Telemetry **Quality Rating** block for the selected turn.
- **Quality by Setting** — after enough rated turns, the sidebar groups average quality by **model**, **web search mode**, and **streaming** on/off (`js/telemetry/qualityInsights.js`).
- **Recommendations** — with sufficient rated history, the UI may suggest toggling web search or streaming when averages favor a setting; **Apply** updates **runtime** settings and the form controls for the next request; use **Save** in Settings if you want the choice in **localStorage** across reloads.
- **Input coaching** — short hint above the composer (`computeNextTurnSuggestion`) derived from rated turns; hidden while streaming or in turn-compare mode.

### Why

Subjective “was this good?” becomes a **session-level signal** next to cost and latency, and patterns across settings are visible without exporting data.

### Docs

`js/utils/quality.js`, `js/telemetry/qualityInsights.js`, `js/ui/metricsView.js`, `js/ui/chatView.js`, `js/main.js`, `css/components/quality.css`, `css/components/metrics.css`.

---

## Markdown rendering (chatty-fe)

### Added

Assistant message bodies go through **marked** and **DOMPurify** (`js/render/markdownToSafeHtml.js`) so replies can use headings, lists, code fences, and links without raw HTML injection.

### Why

Long model output stays readable in-thread without a heavy UI framework.

### Docs

`index.html` (import map), `js/render/markdownToSafeHtml.js`, `js/ui/chatView.js`.

---

## Message vitals cards (chatty-fe)

### Added

Compact **vitals** cards (latency, tok/s, web search used, cost) render beside the **assistant bubble** whose telemetry is selected; in **Turn compare**, both compared bubbles get cards. Hidden while streaming.

### Why

Key numbers stay **in context** with the message you are inspecting (or comparing) without rereading the full sidebar.

### Docs

`js/ui/vitalsCard.js`, `js/main.js`, `css/components/chat.css`.

---

## Cost resolution and breakdown (chatty-fe)

### Added

Per-request USD prefers **`X-Chatty-Cost-Usd`** (surfaced via response metadata) or numeric cost fields on **`usage`**; otherwise the client **estimates** from prompt/completion token counts using **`js/pricing/`** Groq rate tables. When estimating, Telemetry can show **prompt** vs **completion** breakdown and a short disclaimer.

### Why

Observable spend should match billing when the backend reports it, and stay **honest** when only tokens are available.

### Docs

`js/pricing/resolveCost.js`, `js/pricing/estimateCost.js`, `js/services/chatClient.js`, `js/ui/metricsView.js`.
