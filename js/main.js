import { CHAT_COMPLETIONS_PATH, DEFAULT_MODEL, loadSettings } from "./config.js";
import { resolveRequestCost } from "./pricing/resolveCost.js";
import { loadThread, saveThread } from "./storage/threadPersistence.js";
import { sendChatCompletion, streamChatCompletion } from "./services/chatClient.js";
import { buildDebugBundleMarkdown, canExportDebugBundle } from "./telemetry/debugBundle.js";
import { computeCumulativeCostSeries } from "./telemetry/sessionCostSeries.js";
import { buildTelemetrySnapshot } from "./telemetry/snapshot.js";
import {
    buildQualityInsights,
    buildQualityRecommendations,
    computeNextTurnSuggestion,
} from "./telemetry/qualityInsights.js";
import { createAppState, createMessage } from "./state.js";
import { createCompareConstellation } from "./ui/compareConstellation.js";
import { createChatView } from "./ui/chatView.js";
import { createMetricsView } from "./ui/metricsView.js";
import { createSettingsView } from "./ui/settingsView.js";
import { createVitalsCardManager } from "./ui/vitalsCard.js";

const dom = {
    cockpit: document.querySelector("#cockpit"),
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
    qualityGroup: document.querySelector("#metric-quality-group"),
    qualityValue: document.querySelector("#metric-quality-value"),
    qualityInsights: document.querySelector("#quality-insights"),
    qualityInsightsContent: document.querySelector("#quality-insights-content"),
    recommendationEl: document.querySelector("#quality-recommendation"),
    recommendationTextEl: document.querySelector("#quality-recommendation-text"),
    recommendationBtnEl: document.querySelector("#quality-recommendation-apply"),
    resonancePanel: document.querySelector("#resonance-panel"),
    resonanceCount: document.querySelector("#resonance-count"),
    resonanceRibbon: document.querySelector("#resonance-ribbon"),
    inputCoaching: document.querySelector("#input-coaching"),
    inputCoachingText: document.querySelector("#input-coaching-text"),
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

function renderVitalsForMessage(msg) {
    if (!msg) {
        return;
    }
    const node = chatView.getAssistantNode(msg.id);
    if (node) {
        vitalsCardManager.render(node, msg.id);
    }
}

function syncVitalsCards() {
    vitalsCardManager.clearAll();

    if (state.isStreaming) {
        return;
    }

    if (state.telemetryComparePair) {
        const { left, right } = state.telemetryComparePair;
        renderVitalsForMessage(state.messages.find((m) => m.id === left));
        renderVitalsForMessage(state.messages.find((m) => m.id === right));
        return;
    }

    if (state.telemetrySelectionId) {
        renderVitalsForMessage(state.messages.find((m) => m.id === state.telemetrySelectionId));
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
    qualityGroupEl: dom.qualityGroup,
    qualityValueEl: dom.qualityValue,
    qualityInsightsEl: dom.qualityInsights,
    qualityInsightsContentEl: dom.qualityInsightsContent,
    recommendationEl: dom.recommendationEl,
    recommendationTextEl: dom.recommendationTextEl,
    recommendationBtnEl: dom.recommendationBtnEl,
    resonancePanelEl: dom.resonancePanel,
    resonanceCountEl: dom.resonanceCount,
    resonanceRibbonEl: dom.resonanceRibbon,
});

function messageToPersisted(m) {
    return {
        id: m.id,
        role: m.role,
        content: m.content,
        telemetrySnapshot: m.telemetrySnapshot ?? null,
        quality: m.quality ?? null,
        resonance: m.resonance ?? null,
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
    const quality = raw.quality ?? null;
    const rawResonance = raw.resonance ?? null;
    const resonance =
        rawResonance &&
        typeof rawResonance === "object" &&
        typeof rawResonance.excerpt === "string" &&
        rawResonance.excerpt.trim().length > 0
            ? {
                excerpt: rawResonance.excerpt.trim(),
                capturedAt: typeof rawResonance.capturedAt === "number" ? rawResonance.capturedAt : Date.now(),
            }
            : null;
    return {
        id: raw.id,
        role: raw.role,
        content: raw.content,
        telemetrySnapshot: raw.telemetrySnapshot ?? null,
        quality: typeof quality === "number" && quality >= 1 && quality <= 5 ? quality : null,
        resonance,
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

function updateInputCoaching() {
    // Show coaching suggestion in input area based on current session quality
    if (!dom.inputCoaching || !dom.inputCoachingText) {
        return;
    }

    // Don't show during streaming or comparing
    if (state.isStreaming || state.telemetryComparePair) {
        dom.inputCoaching.hidden = true;
        return;
    }

    const suggestion = computeNextTurnSuggestion(state.messages, state.settings);
    if (suggestion) {
        dom.inputCoachingText.textContent = suggestion.text;
        dom.inputCoaching.hidden = false;
    } else {
        dom.inputCoaching.hidden = true;
    }
}

function toPlainExcerpt(content) {
    if (typeof content !== "string") {
        return "Worth keeping.";
    }
    const plain = content
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/[*_>#~-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!plain) {
        return "Worth keeping.";
    }
    const firstSentence = plain.match(/(.{1,140}?[.!?])(\s|$)/)?.[1] ?? plain.slice(0, 140);
    return firstSentence.trim();
}

function buildResonanceItems(messages) {
    return messages
        .filter((m) => m.role === "assistant" && m.resonance?.excerpt)
        .sort((a, b) => (a.resonance?.capturedAt ?? 0) - (b.resonance?.capturedAt ?? 0))
        .map((m, index, list) => ({
            id: m.id,
            excerpt: m.resonance.excerpt,
            meta: index === list.length - 1 ? "Latest kept moment" : `Moment ${index + 1}`,
        }));
}

function computeSessionWeather(messages) {
    const rated = messages.filter((m) => m.role === "assistant" && typeof m.quality === "number");
    const kept = messages.filter((m) => m.role === "assistant" && m.resonance?.excerpt);
    const assistantCount = messages.filter((m) => m.role === "assistant").length;

    if (assistantCount === 0) {
        return "neutral";
    }

    const averageQuality = rated.length > 0
        ? rated.reduce((sum, m) => sum + m.quality, 0) / rated.length
        : 0;
    const highQualityCount = rated.filter((m) => m.quality >= 4).length;
    const lowQualityCount = rated.filter((m) => m.quality <= 2).length;
    const resonanceRatio = kept.length / Math.max(assistantCount, 1);

    if (lowQualityCount >= 2 && averageQuality > 0 && averageQuality <= 2.8) {
        return "storm";
    }

    if (kept.length >= 1 || resonanceRatio >= 0.34) {
        return "ember";
    }

    if (highQualityCount >= 2 || averageQuality >= 4.1) {
        return "lucid";
    }

    return "neutral";
}

function applySessionWeather() {
    if (!dom.cockpit) {
        return;
    }
    dom.cockpit.dataset.weather = computeSessionWeather(state.messages);
}

function applyTelemetryView() {
    try {
        if (state.isStreaming) {
            metricsView.setTelemetryViewMode("live");
            chatView.setTelemetrySelection(null);
            chatView.setCompareHighlight({ pendingId: null, leftId: null, rightId: null });
            metricsView.hideTelemetryDiff();
            const insights = buildQualityInsights(state.messages);
            metricsView.showQualityInsights(insights);
            const recommendation = buildQualityRecommendations(state.messages);
            metricsView.showRecommendation(recommendation);
            metricsView.showResonance(buildResonanceItems(state.messages), state.telemetrySelectionId);
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
                metricsView.setQualityDisplay(leftMsg?.quality);
                metricsView.showTelemetryDiff(lSnap, rSnap, leftMsg?.quality, rightMsg?.quality);
                metricsView.showQualityInsights(null);
                metricsView.hideRecommendation();
                metricsView.showResonance(buildResonanceItems(state.messages), null);
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
            metricsView.showResonance(buildResonanceItems(state.messages), null);
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
            metricsView.showResonance(buildResonanceItems(state.messages), null);
            updateDebugBundleButton();
            refreshSessionSparkline();
            return;
        }

        metricsView.hydrateFromSnapshot(snapshot, state.sessionCostUsd);
        metricsView.setQualityDisplay(msg?.quality);
        const viewingHistory = targetId !== lastId;
        const mode = state.telemetryComparePendingId ? "pending" : viewingHistory ? "history" : "live";
        metricsView.setTelemetryViewMode(mode);
        const insights = buildQualityInsights(state.messages);
        metricsView.showQualityInsights(insights);
        const recommendation = buildQualityRecommendations(state.messages);
        metricsView.showRecommendation(recommendation);
        metricsView.showResonance(buildResonanceItems(state.messages), targetId);
        chatView.setTelemetrySelection(viewingHistory ? targetId : null);
        chatView.setCompareHighlight({
            pendingId: state.telemetryComparePendingId,
            leftId: null,
            rightId: null,
        });
        updateDebugBundleButton();
        refreshSessionSparkline();
    } finally {
        applySessionWeather();
        syncCompareConstellation();
        syncVitalsCards();
        updateChatResetButton();
        updateInputCoaching();
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
            nextMessages.push(createMessage(m.role, m.content, {
                id: m.id,
                telemetrySnapshot: m.telemetrySnapshot,
                quality: m.quality,
                resonance: m.resonance,
            }));
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
        const handle = chatView.addMessage(m.role, m.content, {
            id: m.id,
            selectable: m.role === "assistant" && Boolean(m.telemetrySnapshot),
            quality: m.quality,
        });
        if (m.quality && handle.qualityDisplay) {
            chatView.setQualityRating(handle.qualityDisplay, m.quality);
        }
        if (m.resonance) {
            chatView.setResonanceState(m.id, m.resonance);
        }
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

// Handle quality rating clicks via event delegation
dom.messages.addEventListener("click", (event) => {
    if (event.target.closest(".quality-rating-dot, [data-resonance-toggle]")) {
        event.stopPropagation();
    }
}, true);

dom.messages.addEventListener("click", (event) => {
    const resonanceToggle = event.target.closest("[data-resonance-toggle]");
    if (resonanceToggle) {
        event.stopPropagation();
        const messageId = resonanceToggle.getAttribute("data-message-id");
        const message = state.messages.find((m) => m.id === messageId);
        if (!message) return;

        message.resonance = message.resonance?.excerpt
            ? null
            : {
                excerpt: toPlainExcerpt(message.content),
                capturedAt: Date.now(),
            };

        chatView.setResonanceState(message.id, message.resonance);
        persistSession();
        applyTelemetryView();
        return;
    }

    const qualityDot = event.target.closest(".quality-rating-dot");
    if (!qualityDot) return;

    const rating = parseInt(qualityDot.getAttribute("data-rating"), 10);
    const control = qualityDot.closest(".quality-rating-control");
    const qualityDisplay = control?.closest(".message-quality-display");
    if (!qualityDisplay) return;

    const messageId = qualityDisplay.getAttribute("data-message-id");
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;

    // Update state
    message.quality = rating;

    // Update UI
    chatView.setQualityRating(qualityDisplay, rating);

    // Persist and update coaching
    persistSession();
    updateInputCoaching();
    applyTelemetryView();
});

dom.resonanceRibbon?.addEventListener("click", (event) => {
    const item = event.target.closest(".resonance-panel__item");
    if (!item) {
        return;
    }
    const messageId = item.dataset.messageId;
    if (!messageId) {
        return;
    }

    state.telemetryComparePendingId = null;
    state.telemetryComparePair = null;
    const lastId = getLastAssistantSnapshotId(state.messages);
    state.telemetrySelectionId = messageId === lastId ? null : messageId;
    applyTelemetryView();
    persistSession();
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

dom.recommendationBtnEl?.addEventListener("click", () => {
    const recEl = dom.recommendationEl;
    if (!recEl) return;
    const recData = recEl.dataset.recommendation;
    if (!recData) return;

    try {
        const recommendation = JSON.parse(recData);
        if (recommendation.type === "webSearch") {
            state.settings.webSearchMode = recommendation.setting;
            dom.settingsWebSearchMode.value = recommendation.setting;
        } else if (recommendation.type === "streaming") {
            state.settings.streamEnabled = recommendation.setting === "on";
            dom.settingsStreamEnabled.checked = recommendation.setting === "on";
        }
        metricsView.hideRecommendation();
        persistSession();
    } catch (e) {
        console.error("Failed to apply recommendation:", e);
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
