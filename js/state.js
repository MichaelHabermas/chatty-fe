function createAppState(initialSettings) {
    return {
        settings: initialSettings,
        /** Incremented on New chat reset; stale request handlers bail via epoch check */
        requestEpoch: 0,
        messages: [],
        isStreaming: false,
        currentAssistantMessageId: null,
        requestStartedAt: null,
        abortController: null,
        sessionCostUsd: 0,
        telemetrySelectionId: null,
        /** @type {string | null} first Shift+click target for turn compare */
        telemetryComparePendingId: null,
        /** @type {{ left: string, right: string } | null} two assistant ids (selection order) */
        telemetryComparePair: null,
    };
}

function createMessage(role, content, extra = {}) {
    return {
        id: extra.id ?? `${role}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        role,
        content,
        telemetrySnapshot: extra.telemetrySnapshot ?? null,
        quality: extra.quality ?? null,
        resonance: extra.resonance ?? null,
    };
}

export { createAppState, createMessage };
