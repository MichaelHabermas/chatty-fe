import { loadSettings } from "./config.js";
import { resolveRequestCost } from "./pricing/resolveCost.js";
import { sendChatCompletion, streamChatCompletion } from "./services/chatClient.js";
import { createAppState, createMessage } from "./state.js";
import { createChatView } from "./ui/chatView.js";
import { createMetricsView } from "./ui/metricsView.js";
import { createSettingsView } from "./ui/settingsView.js";

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
});

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
    },
);

metricsView.updateFromSettings(initialSettings);
chatView.setConnectionStatus(`ready • ${initialSettings.baseUrl}`);
metricsView.resetDynamic();
metricsView.updateSessionCost(state.sessionCostUsd);

dom.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prompt = dom.chatInput.value.trim();
    if (!prompt || state.isStreaming) {
        return;
    }

    const userMessage = createMessage("user", prompt);
    state.messages.push(userMessage);
    chatView.addMessage("user", prompt);
    chatView.clearInput();
    chatView.focusInput();

    const assistantHandle = chatView.addMessage("assistant", "");
    const assistantMessage = createMessage("assistant", "");
    state.messages.push(assistantMessage);
    state.currentAssistantMessageId = assistantMessage.id;
    state.isStreaming = true;
    state.requestStartedAt = Date.now();
    state.abortController = new AbortController();

    chatView.setBusy(true);
    metricsView.resetDynamic();
    metricsView.updateSessionCost(state.sessionCostUsd);
    metricsView.updateFromSettings(state.settings);
    metricsView.setStreamingActive(state.settings.streamEnabled);

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
            metricsView.updateUsage(result.usage, Date.now() - state.requestStartedAt);
            metricsView.updateWebSources(result.webSources);
            applyCost(result.usage, result.metadata, result.model);
            metricsView.setStreamingActive(false);
            return;
        }

        const streamState = {
            text: "",
            usage: null,
            webSources: [],
        };

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

        metricsView.updateUsage(streamState.usage, Date.now() - state.requestStartedAt);
        applyCost(streamState.usage, result.metadata, streamResult.model);
        metricsView.setStreamingActive(false);
    } catch (error) {
        const errorMessage = mapErrorMessage(error);
        assistantMessage.content = errorMessage;
        chatView.updateMessage(assistantHandle, errorMessage);
        chatView.setConnectionStatus("request failed");
        metricsView.setStreamingActive(false);
    } finally {
        state.isStreaming = false;
        state.abortController = null;
        state.currentAssistantMessageId = null;
        chatView.setBusy(false);
    }
});

function applyCost(usage, metadata, model) {
    const resolution = resolveRequestCost({ usage, metadata, model });
    if (resolution.usd != null && resolution.source !== "none") {
        state.sessionCostUsd += resolution.usd;
    }
    metricsView.updateCost(resolution, state.sessionCostUsd);
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
