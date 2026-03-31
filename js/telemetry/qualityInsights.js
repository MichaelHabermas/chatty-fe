/**
 * Quality Insights - Analyze quality patterns across settings
 * Groups messages by model, web search mode, and streaming to show comparative quality
 */

/**
 * Extract settings from message for comparison
 */
function extractMessageSettings(message, snapshot) {
    if (!snapshot) {
        return null;
    }

    return {
        model: snapshot.model || "unknown",
        webSearchMode: snapshot.webSearchMode || "auto",
        streaming: snapshot.streamEnabled ? "on" : "off",
    };
}

/**
 * Compute quality statistics grouped by a specific dimension
 * @param {Array} messages - all messages
 * @param {string} dimension - "model", "webSearchMode", or "streaming"
 * @returns {Array<{ label: string, count: number, avgQuality: number, ratings: number[] }>}
 */
function computeQualityByDimension(messages, dimension) {
    const groups = {};

    for (const msg of messages) {
        if (msg.role !== "assistant" || !msg.telemetrySnapshot || msg.quality == null) {
            continue;
        }

        const settings = extractMessageSettings(msg, msg.telemetrySnapshot);
        if (!settings) continue;

        const key = settings[dimension];
        if (!groups[key]) {
            groups[key] = { ratings: [] };
        }
        groups[key].ratings.push(msg.quality);
    }

    const results = [];
    for (const [label, data] of Object.entries(groups)) {
        const avgQuality = data.ratings.length > 0 ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length : 0;
        results.push({
            label,
            count: data.ratings.length,
            avgQuality: Math.round(avgQuality * 10) / 10,
            ratings: data.ratings,
        });
    }

    // Sort by count (most common first), then by label
    results.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return results;
}

/**
 * Build insights from all messages
 * @param {Array} messages - all messages in session
 * @returns {object} insights object with model, webSearch, streaming stats
 */
function buildQualityInsights(messages) {
    // Filter to only assistant messages with quality ratings
    const ratedMessages = messages.filter(
        (m) => m.role === "assistant" && m.telemetrySnapshot && m.quality != null
    );

    if (ratedMessages.length < 2) {
        return null;
    }

    return {
        totalRated: ratedMessages.length,
        model: computeQualityByDimension(ratedMessages, "model"),
        webSearch: computeQualityByDimension(ratedMessages, "webSearchMode"),
        streaming: computeQualityByDimension(ratedMessages, "streaming"),
    };
}

/**
 * Format insight group for display
 */
function formatInsightGroup(group) {
    return {
        label: group.label,
        quality: group.avgQuality,
        count: group.count,
        badge: `${group.avgQuality}/5 (${group.count})`,
    };
}

/**
 * Compute average of array
 */
function avg(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Build a single recommendation if data supports it
 * @param {Array} messages - all messages
 * @returns {object|null} recommendation with type, setting, improvement, confidence
 */
function buildQualityRecommendations(messages) {
    const ratedMessages = messages.filter(
        (m) => m.role === "assistant" && m.telemetrySnapshot && m.quality != null
    );

    if (ratedMessages.length < 3) {
        return null;
    }

    const byWebSearch = { on: [], off: [], auto: [] };
    const byStreaming = { on: [], off: [] };

    for (const msg of ratedMessages) {
        const snap = msg.telemetrySnapshot;
        const q = msg.quality;

        const wsMode = snap.webSearchMode || "auto";
        if (byWebSearch[wsMode]) {
            byWebSearch[wsMode].push(q);
        }

        const streamMode = snap.streamEnabled ? "on" : "off";
        byStreaming[streamMode].push(q);
    }

    const recommendations = [];

    // Web search: check if "on" is better than "auto" or "off"
    const wsOnAvg = byWebSearch.on.length >= 2 ? avg(byWebSearch.on) : 0;
    const wsAutoAvg = byWebSearch.auto.length >= 2 ? avg(byWebSearch.auto) : 0;
    const wsOffAvg = byWebSearch.off.length >= 2 ? avg(byWebSearch.off) : 0;
    const wsOtherAvg = Math.max(wsAutoAvg, wsOffAvg);

    if (wsOnAvg > wsOtherAvg + 0.15 && byWebSearch.on.length >= 2) {
        recommendations.push({
            type: "webSearch",
            setting: "on",
            improvement: (wsOnAvg - wsOtherAvg).toFixed(1),
            confidence: byWebSearch.on.length,
        });
    }

    // Streaming: check if "on" is better than "off"
    const streamOnAvg = byStreaming.on.length >= 2 ? avg(byStreaming.on) : 0;
    const streamOffAvg = byStreaming.off.length >= 2 ? avg(byStreaming.off) : 0;

    if (streamOnAvg > streamOffAvg + 0.15 && byStreaming.on.length >= 2) {
        recommendations.push({
            type: "streaming",
            setting: "on",
            improvement: (streamOnAvg - streamOffAvg).toFixed(1),
            confidence: byStreaming.on.length,
        });
    }

    // Return strongest recommendation (highest confidence)
    if (recommendations.length === 0) {
        return null;
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Compute a coaching suggestion for the next turn based on current session quality
 * @param {Array} messages - all messages in session
 * @param {object} currentSettings - current settings { webSearchMode, streamEnabled }
 * @returns {object|null} suggestion with text and context
 */
function computeNextTurnSuggestion(messages, currentSettings) {
    const ratedMessages = messages.filter(
        (m) => m.role === "assistant" && m.telemetrySnapshot && m.quality != null
    );

    if (ratedMessages.length < 2) {
        return null;
    }

    // Find best performers by setting
    const byWebSearch = { on: [], off: [], auto: [] };
    const byStreaming = { on: [], off: [] };

    for (const msg of ratedMessages) {
        const snap = msg.telemetrySnapshot;
        const q = msg.quality;

        const wsMode = snap.webSearchMode || "auto";
        if (byWebSearch[wsMode]) {
            byWebSearch[wsMode].push(q);
        }

        const streamMode = snap.streamEnabled ? "on" : "off";
        byStreaming[streamMode].push(q);
    }

    // Check web search: is the best performer different from current?
    const wsAverages = {
        on: byWebSearch.on.length > 0 ? avg(byWebSearch.on) : 0,
        off: byWebSearch.off.length > 0 ? avg(byWebSearch.off) : 0,
        auto: byWebSearch.auto.length > 0 ? avg(byWebSearch.auto) : 0,
    };

    const bestWsMode = Object.entries(wsAverages)
        .filter(([mode, _]) => byWebSearch[mode].length >= 2)
        .sort((a, b) => b[1] - a[1])[0];

    if (
        bestWsMode &&
        bestWsMode[1] > 3.5 &&
        bestWsMode[0] !== currentSettings?.webSearchMode
    ) {
        return {
            type: "webSearch",
            text: `Your best responses used web search ${bestWsMode[0]}—consider ${bestWsMode[0] === "on" ? "enabling" : "disabling"} it.`,
            quality: bestWsMode[1],
        };
    }

    // Check streaming: is the best performer different from current?
    const streamAverages = {
        on: byStreaming.on.length > 0 ? avg(byStreaming.on) : 0,
        off: byStreaming.off.length > 0 ? avg(byStreaming.off) : 0,
    };

    const bestStreamMode = Object.entries(streamAverages)
        .filter(([mode, _]) => byStreaming[mode].length >= 2)
        .sort((a, b) => b[1] - a[1])[0];

    const currentStreamMode = currentSettings?.streamEnabled ? "on" : "off";
    if (
        bestStreamMode &&
        bestStreamMode[1] > 3.5 &&
        bestStreamMode[0] !== currentStreamMode
    ) {
        return {
            type: "streaming",
            text: `Your best responses had streaming ${bestStreamMode[0]}—consider ${bestStreamMode[0] === "on" ? "enabling" : "disabling"} it.`,
            quality: bestStreamMode[1],
        };
    }

    return null;
}

export {
    buildQualityInsights,
    computeQualityByDimension,
    formatInsightGroup,
    extractMessageSettings,
    buildQualityRecommendations,
    computeNextTurnSuggestion,
};
