import { DEFAULT_MODEL } from "../config.js";

function getLastAssistantSnapshotId(messages) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role === "assistant" && m.telemetrySnapshot) {
            return m.id;
        }
    }
    return null;
}

/** @param {{ isStreaming: boolean, messages: object[], telemetrySelectionId: string | null }} state */
function canExportDebugBundle(state) {
    if (state.isStreaming) {
        return false;
    }
    const lastId = getLastAssistantSnapshotId(state.messages);
    if (!lastId) {
        return false;
    }
    let targetId = state.telemetrySelectionId;
    if (!targetId || !state.messages.some((m) => m.id === targetId && m.telemetrySnapshot)) {
        targetId = lastId;
    }
    const msg = state.messages.find((m) => m.id === targetId);
    const snapshot = msg?.telemetrySnapshot;
    return Boolean(snapshot && snapshot.v === 1);
}

/** @param {{ isStreaming: boolean, messages: object[], telemetrySelectionId: string | null }} state */
function resolveDebugTurn(state) {
    if (state.isStreaming) {
        return null;
    }
    const lastId = getLastAssistantSnapshotId(state.messages);
    if (!lastId) {
        return null;
    }
    let targetId = state.telemetrySelectionId;
    if (!targetId || !state.messages.some((m) => m.id === targetId && m.telemetrySnapshot)) {
        targetId = lastId;
    }
    const idx = state.messages.findIndex((m) => m.id === targetId);
    if (idx < 0) {
        return null;
    }
    const msg = state.messages[idx];
    const snapshot = msg?.telemetrySnapshot;
    if (!snapshot || snapshot.v !== 1) {
        return null;
    }

    const slice = state.messages.slice(0, idx + 1);
    const requestMessages = slice
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

    return { targetId, snapshot, requestMessages };
}

/** @param {{ isStreaming: boolean, messages: object[], telemetrySelectionId: string | null }} state */
function buildDebugBundleMarkdown(state, opts) {
    const turn = resolveDebugTurn(state);
    if (!turn) {
        return "";
    }

    const { snapshot, requestMessages } = turn;
    const model = snapshot.model || opts.defaultModel || DEFAULT_MODEL;
    const origin = normalizeOrigin(opts.baseUrl || "");
    const path = opts.completionsPath || "/v1/chat/completions";

    const requestBody = {
        model,
        messages: requestMessages,
        stream: snapshot.streamEnabled,
        web_search_mode: snapshot.webSearchMode,
    };

    const redacted = {
        chatty_fe_debug_bundle: 1,
        generated_at: new Date().toISOString(),
        backend: {
            origin,
            path,
        },
        request_body: requestBody,
        telemetry_snapshot: snapshot,
        notes: [
            "messages reflect final content after completion; the live request may have used an empty assistant message until the stream finished.",
            "No API keys, bearer tokens, or cookies are included.",
        ],
    };

    const jsonBlock = JSON.stringify(redacted, null, 2);
    const bodyJson = JSON.stringify(requestBody, null, 2);

    return [
        "## Chatty debug bundle",
        "",
        "### Redacted JSON (full)",
        "",
        "```json",
        jsonBlock,
        "```",
        "",
        "### Request body (save as body.json for curl)",
        "",
        "```json",
        bodyJson,
        "```",
        "",
        "### curl",
        "",
        "```bash",
        `BASE_URL="${origin}"`,
        `curl -sS -X POST "\${BASE_URL}${path}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
        `  --data-binary @body.json`,
        "```",
        "",
        "Use the **Request body** block as `body.json` next to where you run `curl`, or set `BASE_URL` to your backend origin.",
        "",
    ].join("\n");
}

function normalizeOrigin(baseUrl) {
    const raw = (baseUrl || "").trim();
    if (!raw) {
        return "(set Backend URL in Settings)";
    }
    try {
        return new URL(raw).origin.replace(/\/$/, "");
    } catch {
        return raw.replace(/\/$/, "");
    }
}

export { buildDebugBundleMarkdown, canExportDebugBundle, resolveDebugTurn };
