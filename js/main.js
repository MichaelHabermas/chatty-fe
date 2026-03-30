/**
 * Chatty FE entry — keep this file thin; compose submodules here.
 *
 * Suggested layout (SOLID-oriented) as the app grows:
 * - config.js       — env / API base URL (single source of truth)
 * - services/       — chatClient.js (HTTP/stream only; UI imports this, not raw fetch)
 * - ui/chatView.js  — messages + input wiring
 * - ui/metricsView.js — latency, tokens, request id DOM updates
 * - app.js          — optional composition root if main.js should stay one-liner
 */

// Future: import { initApp } from './app.js';
// initApp();
