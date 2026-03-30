function createAppState(initialSettings) {
    return {
        settings: initialSettings,
        messages: [],
        isStreaming: false,
        currentAssistantMessageId: null,
        requestStartedAt: null,
        abortController: null,
    };
}

function createMessage(role, content) {
    return {
        id: `${role}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        role,
        content,
    };
}

export { createAppState, createMessage };
