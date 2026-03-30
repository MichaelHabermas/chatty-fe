function createAppState(initialSettings) {
    return {
        settings: initialSettings,
        messages: [],
        isStreaming: false,
        currentAssistantMessageId: null,
        requestStartedAt: null,
        abortController: null,
        sessionCostUsd: 0,
        telemetrySelectionId: null,
    };
}

function createMessage(role, content, extra = {}) {
    return {
        id: extra.id ?? `${role}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        role,
        content,
        telemetrySnapshot: extra.telemetrySnapshot ?? null,
    };
}

export { createAppState, createMessage };
