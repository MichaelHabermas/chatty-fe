import { CHAT_COMPLETIONS_PATH, DEFAULT_MODEL, loadSettings } from "./config.js";
import { resolveRequestCost } from "./pricing/resolveCost.js";
import { loadThread, saveThread } from "./storage/threadPersistence.js";
import { sendChatCompletion, streamChatCompletion } from "./services/chatClient.js";
import { buildDebugBundleMarkdown, canExportDebugBundle } from "./telemetry/debugBundle.js";
import { computeCumulativeCostSeries } from "./telemetry/sessionCostSeries.js";
import { buildTelemetrySnapshot } from "./telemetry/snapshot.js";
import { createAppState, createMessage } from "./state.js";
import { createCompareConstellation } from "./ui/compareConstellation.js";
import { createChatView } from "./ui/chatView.js";
import { createMetricsView } from "./ui/metricsView.js";
import { createSettingsView } from "./ui/settingsView.js";
import { createVitalsCardManager } from "./ui/vitalsCard.js";

const dom = {
    chatForm: document.querySelector("#chat-form"),
    chatInput: document.querySelector("#chat-input"),
    sendBtn: document.querySelector("#send-btn"),
    messages: document.querySelector("#messages"),
    inputHint: document.querySelector("#input-hint"),
    emptyState: document.querySelector("#empty-state-message"),
    connectionStatus: document.querySelector("#connection-status"),
    settingsPanel: document.querySelector("#settings-panel"),
    settingsToggleBtn: document.querySelector("#settings-toggle-btn"),
    settingsForm: document.querySelector("#settings-form"),
    settingsBaseUrl: document.querySelector("#settings-base-url"),
    settingsApiKey: document.querySelector("#settings-api-key"),
    settingsStreamEnabled: document.querySelector("#settings-stream-enabled"),
    settingsWebSearchMode: document.querySelector("#settings-web-search-mode"),
    settingsResetBtn: document.querySelector("#settings-reset-btn"),
    chatResetBtn: document.querySelector("#chat-reset-btn"),
    metricModel: document.querySelector("#metric-model"),
    metricLatency: document.querySelector("#metric-latency"),
    metricStreamLabel: document.querySelector("#metric-stream-label"),
    metricStreamIndicator: document.querySelector("#metric-stream-indicator"),
    metricTokensRate: document.querySelector("#metric-tokens-rate"),
    metricTotalTokens: document.querySelector("#metric-total-tokens"),
    metricWebSearch: document.querySelector("#metric-web-search"),
    metricWebSearchResults: document.querySelector("#metric-web-search-results"),
    metricRequestIdValue: document.querySelector("#metric-request-id-value"),
    metricProcessingTime: document.querySelector("#metric-processing-time"),
    metricResponseTime: document.querySelector("#metric-response-time"),
    metricProgressFill: document.querySelector("#metric-progress-fill"),
    metricCostLast: document.querySelector("#metric-cost-last"),
    metricCostSource: document.querySelector("#metric-cost-source"),
    metricCostBreakdown: document.querySelector("#metric-cost-breakdown"),
    metricCostPrompt: document.querySelector("#metric-cost-prompt"),
    metricCostCompletion: document.querySelector("#metric-cost-completion"),
    metricCostSession: document.querySelector("#metric-cost-session"),
    metricCostDisclaimer: document.querySelector("#metric-cost-disclaimer"),
    costSessionSparkline: document.querySelector("#cost-session-sparkline"),
    costSessionSparklinePolyline: document.querySelector("#cost-session-sparkline-polyline"),
    metricsPanel: document.querySelector("#metrics-panel"),
    telemetryViewLabel: document.querySelector("#telemetry-view-label"),
    copyDebugBundleBtn: document.querySelector("#copy-debug-bundle-btn"),
    telemetryDiff: document.querySelector("#telemetry-diff"),
    telemetryDiffBody: document.querySelector("#telemetry-diff-body"),
    telemetryDiffClose: document.querySelector("#telemetry-diff-close"),
};

const initialSettings = loadSettings();
const state = createAppState(initialSettings);

const chatView = createChatView({
    messagesEl: dom.messages,
    inputEl: dom.chatInput,
    sendBtnEl: dom.sendBtn,
    hintEl: dom.inputHint,
    emptyStateEl: dom.emptyState,
    connectionStatusEl: dom.connectionStatus,
});

const compareConstellation = createCompareConstellation({
    messagesEl: dom.messages,
    getAssistantNode: (id) => chatView.getAssistantNode(id),
});

const vitalsCardManager = createVitalsCardManager({
    messagesEl: dom.messages,
    getMessageMetrics: (messageId) => {
        const message = state.messages.find((m) => m.id === messageId);
        if (!message || !message.telemetrySnapshot) {
            return null;
        }
        const snap = message.telemetrySnapshot;
        const latency = snap.metadata?.latencyMs ?? snap.durationMs;
        const tokensOut = snap.usage?.completion_tokens ?? 0;
        const tokensPerSecond = latency > 0 ? (tokensOut / latency) * 1000 : 0;
        return {
            latency,
            tokensPerSecond,
            webSearchUsed: snap.webSourcesCount > 0,
            cost: snap.resolution?.usd || 0,
        };
    },
});

function syncCompareConstellation() {
    if (state.isStreaming || !state.telemetryComparePair) {
        compareConstellation.sync(null);
        return;
    }
    compareConstellation.sync({
        left: state.telemetryComparePair.left,
        right: state.telemetryComparePair.right,
    });
}

function syncVitalsCards() {
    vitalsCardManager.clearAll();

    if (state.isStreaming) {
        return;
    }

    // Show vitals for compare mode
    if (state.telemetryComparePair) {
        const leftMsg = state.messages.find((m) => m.id === state.telemetryComparePair.left);
        const rightMsg = state.messages.find((m) => m.id === state.telemetryComparePair.right);

        if (leftMsg) {
            const leftNode = chatView.getAssistantNode(leftMsg.id);
            if (leftNode) {
                vitalsCardManager.render(leftNode, leftMsg.id);
            }
        }

        if (rightMsg) {
            const rightNode = chatView.getAssistantNode(rightMsg.id);
            if (rightNode) {
                vitalsCardManager.render(rightNode, rightMsg.id);
            }
        }
        return;
    }

    // Show vitals for single selection
    if (state.telemetrySelectionId) {
        const msg = state.messages.find((m) => m.id === state.telemetrySelectionId);
        if (msg) {
            const node = chatView.getAssistantNode(msg.id);
            if (node) {
                vitalsCardManager.render(node, msg.id);
            }
        }
    }
}

const metricsView = createMetricsView({
    modelEl: dom.metricModel,
    latencyEl: dom.metricLatency,
    streamLabelEl: dom.metricStreamLabel,
    streamIndicatorEl: dom.metricStreamIndicator,
    tokensRateEl: dom.metricTokensRate,
    totalTokensEl: dom.metricTotalTokens,
    webSearchEl: dom.metricWebSearch,
    webSearchResultsEl: dom.metricWebSearchResults,
    requestIdValueEl: dom.metricRequestIdValue,
    processingTimeEl: dom.metricProcessingTime,
    responseTimeEl: dom.metricResponseTime,
    progressFillEl: dom.metricProgressFill,
    costLastEl: dom.metricCostLast,
    costSourceBadgeEl: dom.metricCostSource,
    costBreakdownEl: dom.metricCostBreakdown,
    costPromptEl: dom.metricCostPrompt,
    costCompletionEl: dom.metricCostCompletion,
    costSessionEl: dom.metricCostSession,
    costDisclaimerEl: dom.metricCostDisclaimer,
    panelEl: dom.metricsPanel,
    telemetryViewLabelEl: dom.telemetryViewLabel,
    costSessionSparklineEl: dom.costSessionSparkline,
    costSessionSparklinePolylineEl: dom.costSessionSparklinePolyline,
    telemetryDiffEl: dom.telemetryDiff,
    telemetryDiffBodyEl: dom.telemetryDiffBody,
});

function messageToPersisted(m) {
    return {
        id: m.id,
        role: m.role,
        content: m.content,
        telemetrySnapshot: m.telemetrySnapshot ?? null,
    };
}

function validatePersistedMessage(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    if (typeof raw.id !== "string" || raw.id.length === 0) {
        return null;
    }
    if (raw.role !== "user" && raw.role !== "assistant") {
        return null;
    }
    if (typeof raw.content !== "string") {
        return null;
    }
    return {
        id: raw.id,
        role: raw.role,
        content: raw.content,
        telemetrySnapshot: raw.telemetrySnapshot ?? null,
    };
}

function persistSession() {
    saveThread({
        messages: state.messages.map(messageToPersisted),
        sessionCostUsd: state.sessionCostUsd,
        telemetrySelectionId: state.telemetrySelectionId,
    });
}

function resetMetricsToSessionBaseline() {
    metricsView.resetDynamic();
    metricsView.updateSessionCost(state.sessionCostUsd);
    metricsView.updateFromSettings(state.settings);
}

function getLastAssistantSnapshotId(messages) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role === "assistant" && m.telemetrySnapshot) {
            return m.id;
        }
    }
    return null;
}

function updateDebugBundleButton() {
    if (!dom.copyDebugBundleBtn) {
        return;
    }
    dom.copyDebugBundleBtn.disabled = !canExportDebugBundle(state);
}

function refreshSessionSparkline() {
    metricsView.updateSessionCostSparkline(computeCumulativeCostSeries(state.messages));
}

function clearTelemetryCompare() {
    state.telemetryComparePendingId = null;
    state.telemetryComparePair = null;
}

function updateChatResetButton() {
    if (!dom.chatResetBtn) {
        return;
    }
    const canReset = state.messages.length > 0 || state.isStreaming;
    dom.chatResetBtn.disabled = !canReset;
}

function resetChat() {
    state.requestEpoch += 1;
    try {
        state.abortController?.abort();
    } catch {
        /* ignore */
    }
    state.messages = [];
    state.sessionCostUsd = 0;
    state.telemetrySelectionId = null;
    clearTelemetryCompare();
    state.currentAssistantMessageId = null;
    state.isStreaming = false;
    state.abortController = null;
    state.requestStartedAt = null;

    chatView.resetToEmptyThread();
    chatView.setBusy(false);
    chatView.setAssistantInteractionEnabled(true);
    chatView.setTelemetrySelection(null);
    chatView.setCompareHighlight({ pendingId: null, leftId: null, rightId: null });
    vitalsCardManager.clearAll();
    persistSession();
    applyTelemetryView();
}

function applyTelemetryView() {
    try {
        if (state.isStreaming) {
            metricsView.setTelemetryViewMode("live");
            chatView.setTelemetrySelection(null);
            chatView.setCompareHighlight({ pendingId: null, leftId: null, rightId: null });
            metricsView.hideTelemetryDiff();
            updateDebugBundleButton();
            refreshSessionSparkline();
            return;
        }

        const pair = state.telemetryComparePair;
        if (pair) {
            const leftMsg = state.messages.find((m) => m.id === pair.left);
            const rightMsg = state.messages.find((m) => m.id === pair.right);
            const lSnap = leftMsg?.telemetrySnapshot;
            const rSnap = rightMsg?.telemetrySnapshot;
            if (lSnap?.v === 1 && rSnap?.v === 1) {
                metricsView.hydrateFromSnapshot(lSnap, state.sessionCostUsd);
                metricsView.showTelemetryDiff(lSnap, rSnap);
                metricsView.setTelemetryViewMode("diff");
                chatView.setTelemetrySelection(null);
                chatView.setCompareHighlight({ pendingId: null, leftId: pair.left, rightId: pair.right });
                updateDebugBundleButton();
                refreshSessionSparkline();
                return;
            }
            state.telemetryComparePair = null;
        }

        metricsView.hideTelemetryDiff();

        const lastId = getLastAssistantSnapshotId(state.messages);
        if (!lastId) {
            resetMetricsToSessionBaseline();
            chatView.setTelemetrySelection(null);
            chatView.setCompareHighlight({
                pendingId: state.telemetryComparePendingId,
                leftId: null,
                rightId: null,
            });
            metricsView.setTelemetryViewMode(state.telemetryComparePendingId ? "pending" : "empty");
            updateDebugBundleButton();
            refreshSessionSparkline();
            return;
        }

        let targetId = state.telemetrySelectionId;
        if (!targetId || !state.messages.some((m) => m.id === targetId && m.telemetrySnapshot)) {
            targetId = lastId;
        }

        const msg = state.messages.find((m) => m.id === targetId);
        const snapshot = msg?.telemetrySnapshot;
        if (!snapshot || snapshot.v !== 1) {
            resetMetricsToSessionBaseline();
            chatView.setCompareHighlight({
                pendingId: state.telemetryComparePendingId,
                leftId: null,
                rightId: null,
            });
            metricsView.setTelemetryViewMode(state.telemetryComparePendingId ? "pending" : "empty");
            updateDebugBundleButton();
            refreshSessionSparkline();
            return;
        }

        metricsView.hydrateFromSnapshot(snapshot, state.sessionCostUsd);
        const viewingHistory = targetId !== lastId;
        const mode = state.telemetryComparePendingId ? "pending" : viewingHistory ? "history" : "live";
        metricsView.setTelemetryViewMode(mode);
        chatView.setTelemetrySelection(viewingHistory ? targetId : null);
        chatView.setCompareHighlight({
            pendingId: state.telemetryComparePendingId,
            leftId: null,
            rightId: null,
        });
        updateDebugBundleButton();
        refreshSessionSparkline();
    } finally {
        syncCompareConstellation();
        syncVitalsCards();
        updateChatResetButton();
    }
}

function restorePersistedThread() {
    const persisted = loadThread();
    if (!persisted || !Array.isArray(persisted.messages) || persisted.messages.length === 0) {
        return;
    }

    const nextMessages = [];
    for (const raw of persisted.messages) {
        const m = validatePersistedMessage(raw);
        if (m) {
            nextMessages.push(createMessage(m.role, m.content, { id: m.id, telemetrySnapshot: m.telemetrySnapshot }));
        }
    }
    if (nextMessages.length === 0) {
        return;
    }

    state.messages = nextMessages;
    state.sessionCostUsd = typeof persisted.sessionCostUsd === "number" ? persisted.sessionCostUsd : 0;
    state.telemetrySelectionId =
        typeof persisted.telemetrySelectionId === "string" ? persisted.telemetrySelectionId : null;

    if (state.telemetrySelectionId && !state.messages.some((m) => m.id === state.telemetrySelectionId)) {
        state.telemetrySelectionId = null;
    }

    chatView.clearThreadDom();
    for (const m of state.messages) {
        chatView.addMessage(m.role, m.content, {
            id: m.id,
            selectable: m.role === "assistant" && Boolean(m.telemetrySnapshot),
        });
    }
}

createSettingsView(
    {
        panelEl: dom.settingsPanel,
        toggleBtnEl: dom.settingsToggleBtn,
        formEl: dom.settingsForm,
        baseUrlEl: dom.settingsBaseUrl,
        apiKeyEl: dom.settingsApiKey,
        streamEnabledEl: dom.settingsStreamEnabled,
        webSearchModeEl: dom.settingsWebSearchMode,
        resetBtnEl: dom.settingsResetBtn,
    },
    initialSettings,
    (nextSettings) => {
        state.settings = nextSettings;
        metricsView.updateFromSettings(nextSettings);
        chatView.setConnectionStatus(`ready • ${nextSettings.baseUrl}`);
        applyTelemetryView();
    },
);

metricsView.updateFromSettings(initialSettings);
chatView.setConnectionStatus(`ready • ${initialSettings.baseUrl}`);

chatView.setOnAssistantSelect((id, modifiers) => {
    const shiftKey = modifiers?.shiftKey === true;

    if (shiftKey) {
        if (state.telemetryComparePair) {
            state.telemetryComparePair = null;
        }
        if (state.telemetryComparePendingId === id) {
            state.telemetryComparePendingId = null;
        } else if (!state.telemetryComparePendingId) {
            state.telemetryComparePendingId = id;
        } else {
            const leftId = state.telemetryComparePendingId;
            const leftMsg = state.messages.find((m) => m.id === leftId);
            const rightMsg = state.messages.find((m) => m.id === id);
            if (leftMsg?.telemetrySnapshot?.v === 1 && rightMsg?.telemetrySnapshot?.v === 1) {
                state.telemetryComparePair = { left: leftId, right: id };
            }
            state.telemetryComparePendingId = null;
        }
        state.telemetrySelectionId = null;
    } else {
        state.telemetryComparePendingId = null;
        state.telemetryComparePair = null;
        const lastId = getLastAssistantSnapshotId(state.messages);
        if (id === lastId) {
            state.telemetrySelectionId = null;
        } else {
            state.telemetrySelectionId = id;
        }
    }
    applyTelemetryView();
    persistSession();
});

dom.copyDebugBundleBtn?.addEventListener("click", async () => {
    const btn = dom.copyDebugBundleBtn;
    const text = buildDebugBundleMarkdown(state, {
        baseUrl: state.settings.baseUrl,
        completionsPath: CHAT_COMPLETIONS_PATH,
        defaultModel: DEFAULT_MODEL,
    });
    if (!text || !btn) {
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        const label = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => {
            btn.textContent = label;
        }, 1800);
    } catch {
        chatView.setConnectionStatus("clipboard unavailable");
    }
});

restorePersistedThread();
metricsView.updateSessionCost(state.sessionCostUsd);
applyTelemetryView();

dom.chatResetBtn?.addEventListener("click", () => {
    resetChat();
});

dom.telemetryDiffClose?.addEventListener("click", () => {
    clearTelemetryCompare();
    applyTelemetryView();
    persistSession();
});

const compareCardsClose = document.getElementById("compare-cards-close");
const compareCardsContainer = document.getElementById("compare-cards-container");
compareCardsClose?.addEventListener("click", () => {
    clearTelemetryCompare();
    applyTelemetryView();
    persistSession();
});

compareCardsContainer?.addEventListener("click", (event) => {
    if (event.target === compareCardsContainer) {
        clearTelemetryCompare();
        applyTelemetryView();
        persistSession();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
        return;
    }
    if (document.activeElement === dom.chatInput) {
        return;
    }
    if (!state.telemetryComparePendingId && !state.telemetryComparePair) {
        return;
    }
    clearTelemetryCompare();
    applyTelemetryView();
    persistSession();
});

dom.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prompt = dom.chatInput.value.trim();
    if (!prompt || state.isStreaming) {
        return;
    }

    const epochAtSubmit = state.requestEpoch;

    clearTelemetryCompare();
    state.telemetrySelectionId = null;

    const userMessage = createMessage("user", prompt);
    state.messages.push(userMessage);
    chatView.addMessage("user", prompt);
    chatView.clearInput();
    chatView.focusInput();

    const assistantMessage = createMessage("assistant", "");
    state.messages.push(assistantMessage);
    const assistantHandle = chatView.addMessage("assistant", "", { id: assistantMessage.id });
    persistSession();
    state.currentAssistantMessageId = assistantMessage.id;
    state.isStreaming = true;
    state.requestStartedAt = Date.now();
    state.abortController = new AbortController();
    updateDebugBundleButton();

    chatView.setBusy(true);
    chatView.setAssistantInteractionEnabled(false);
    resetMetricsToSessionBaseline();
    metricsView.setStreamingActive(state.settings.streamEnabled);
    metricsView.setTelemetryViewMode("live");

    try {
        const requestMessages = state.messages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({ role: message.role, content: message.content }));

        const result = await sendChatCompletion({
            baseUrl: state.settings.baseUrl,
            apiKey: state.settings.apiKey,
            messages: requestMessages,
            stream: state.settings.streamEnabled,
            webSearchMode: state.settings.webSearchMode,
            signal: state.abortController.signal,
        });

        metricsView.updateMetadata({ metadata: result.metadata, model: result.model });

        if (result.type === "complete") {
            assistantMessage.content = result.content;
            chatView.updateMessage(assistantHandle, result.content);
            const durationMs = Date.now() - state.requestStartedAt;
            metricsView.updateUsage(result.usage, durationMs);
            metricsView.updateWebSources(result.webSources);
            const resolution = applyCost(result.usage, result.metadata, result.model);
            assistantMessage.telemetrySnapshot = buildTelemetrySnapshot({
                model: result.model,
                metadata: result.metadata,
                usage: result.usage,
                durationMs,
                resolution,
                webSources: result.webSources,
                webSearchMode: state.settings.webSearchMode,
                streamEnabled: state.settings.streamEnabled,
                error: false,
            });
            persistSession();
            metricsView.setStreamingActive(false);
            return;
        }

        const streamState = {
            text: "",
            usage: null,
            webSources: [],
        };

        chatView.setAssistantStreaming(assistantMessage.id, true);

        const streamResult = await streamChatCompletion(result.responseBody, {
            onTextDelta(delta) {
                streamState.text += delta;
                assistantMessage.content = streamState.text;
                chatView.updateMessage(assistantHandle, streamState.text);
            },
            onUsage(usage) {
                streamState.usage = usage;
            },
            onWebSources(webSources) {
                streamState.webSources = webSources;
                metricsView.updateWebSources(webSources);
            },
        });

        metricsView.updateMetadata({
            metadata: result.metadata,
            model: streamResult.model || undefined,
        });

        if (!streamState.text.trim()) {
            const fallback = "No content returned.";
            assistantMessage.content = fallback;
            chatView.updateMessage(assistantHandle, fallback);
        }

        const durationMs = Date.now() - state.requestStartedAt;
        metricsView.updateUsage(streamState.usage, durationMs);
        const resolution = applyCost(streamState.usage, result.metadata, streamResult.model);
        assistantMessage.telemetrySnapshot = buildTelemetrySnapshot({
            model: streamResult.model || undefined,
            metadata: result.metadata,
            usage: streamState.usage,
            durationMs,
            resolution,
            webSources: streamState.webSources,
            webSearchMode: state.settings.webSearchMode,
            streamEnabled: state.settings.streamEnabled,
            error: false,
        });
        persistSession();
        metricsView.setStreamingActive(false);
    } catch (error) {
        const errorMessage = mapErrorMessage(error);
        assistantMessage.content = errorMessage;
        chatView.updateMessage(assistantHandle, errorMessage);
        chatView.setConnectionStatus("request failed");
        const resolution = { usd: null, source: "none" };
        assistantMessage.telemetrySnapshot = buildTelemetrySnapshot({
            model: null,
            metadata: { requestId: "", latencyMs: null, timings: {}, costUsd: null },
            usage: null,
            durationMs: 0,
            resolution,
            webSources: [],
            webSearchMode: state.settings.webSearchMode,
            streamEnabled: state.settings.streamEnabled,
            error: true,
        });
        persistSession();
        metricsView.setStreamingActive(false);
    } finally {
        if (epochAtSubmit !== state.requestEpoch) {
            return;
        }
        chatView.setAssistantStreaming(assistantMessage.id, false);
        state.isStreaming = false;
        state.abortController = null;
        state.currentAssistantMessageId = null;
        chatView.setBusy(false);
        chatView.setAssistantInteractionEnabled(true);
        applyTelemetryView();
    }
});

function applyCost(usage, metadata, model) {
    const resolution = resolveRequestCost({ usage, metadata, model });
    if (resolution.usd != null && resolution.source !== "none") {
        state.sessionCostUsd += resolution.usd;
    }
    metricsView.updateCost(resolution, state.sessionCostUsd);
    return resolution;
}

function mapErrorMessage(error) {
    const message = String(error?.message || "");
    if (error?.name === "TypeError" && /failed to fetch|networkerror|load failed/i.test(message)) {
        return "Cannot reach the API (often CORS). Run: node scripts/dev-server.mjs — then open http://localhost:8787 and keep Base URL as that origin. Or enable CORS on the backend.";
    }
    const status = error?.status;
    switch (status) {
        case 401:
        case 403:
            return "Authentication failed. Check your API key in Settings.";
        case 429:
            return "Rate limited by upstream model provider. Please retry shortly.";
        case 503:
            return "Service unavailable. The backend may be missing required configuration.";
        default:
            if (typeof status === "number" && status >= 500) {
                return "Backend error received. Please retry in a moment.";
            }
            return "Network or request error. Check your backend URL and try again.";
    }
}
