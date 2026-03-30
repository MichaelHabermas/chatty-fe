import { THREAD_STORAGE_KEY } from "../config.js";

/**
 * @param {{ messages: Array<{ id: string, role: string, content: string, telemetrySnapshot?: object | null }>, sessionCostUsd: number, telemetrySelectionId: string | null }} payload
 */
function saveThread(payload) {
    try {
        localStorage.setItem(
            THREAD_STORAGE_KEY,
            JSON.stringify({
                v: 1,
                messages: payload.messages,
                sessionCostUsd: payload.sessionCostUsd,
                telemetrySelectionId: payload.telemetrySelectionId,
            }),
        );
    } catch {}
}

function loadThread() {
    try {
        const raw = localStorage.getItem(THREAD_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.messages)) {
            return null;
        }
        return {
            messages: parsed.messages,
            sessionCostUsd: typeof parsed.sessionCostUsd === "number" ? parsed.sessionCostUsd : 0,
            telemetrySelectionId:
                typeof parsed.telemetrySelectionId === "string" ? parsed.telemetrySelectionId : null,
        };
    } catch {
        return null;
    }
}

export { loadThread, saveThread };
