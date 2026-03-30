function formatUsd4(value) {
    if (value == null || Number.isNaN(value)) {
        return "—";
    }
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
    }).format(value);
}

function createMetricsView(elements) {
    const {
        modelEl,
        latencyEl,
        streamLabelEl,
        streamIndicatorEl,
        tokensRateEl,
        totalTokensEl,
        webSearchEl,
        webSearchResultsEl,
        requestIdValueEl,
        processingTimeEl,
        responseTimeEl,
        progressFillEl,
        costLastEl,
        costSourceBadgeEl,
        costBreakdownEl,
        costPromptEl,
        costCompletionEl,
        costSessionEl,
        costDisclaimerEl,
    } = elements;

    function resetLastRequestCost() {
        costLastEl.textContent = "—";
        costSourceBadgeEl.hidden = true;
        costSourceBadgeEl.textContent = "";
        costSourceBadgeEl.className = "cost-source-badge";
        costBreakdownEl.hidden = true;
        costPromptEl.textContent = "—";
        costCompletionEl.textContent = "—";
        costDisclaimerEl.hidden = true;
    }

    function updateSessionCost(sessionTotalUsd) {
        costSessionEl.textContent = formatUsd4(sessionTotalUsd);
    }

    function setStreamStatus(statusText) {
        streamLabelEl.textContent = statusText;
    }

    function resetDynamic() {
        modelEl.textContent = "--";
        latencyEl.textContent = "--";
        tokensRateEl.textContent = "--";
        totalTokensEl.textContent = "--";
        requestIdValueEl.textContent = "--";
        processingTimeEl.textContent = "--";
        responseTimeEl.textContent = "--";
        progressFillEl.style.width = "0%";
        webSearchResultsEl.textContent = "0 sources indexed";
        setStreamStatus("idle");
        streamIndicatorEl.style.opacity = "0.4";
        resetLastRequestCost();
    }

    function updateFromSettings(settings) {
        webSearchEl.textContent = settings.webSearchMode;
        setStreamStatus(settings.streamEnabled ? "streaming enabled" : "non-stream mode");
    }

    function updateMetadata({ metadata, model }) {
        if (model) {
            modelEl.textContent = model;
        }
        if (metadata?.latencyMs) {
            latencyEl.textContent = String(Math.max(0, Math.round(metadata.latencyMs)));
        }
        if (metadata?.requestId) {
            requestIdValueEl.textContent = metadata.requestId;
        }

        const groqTiming = metadata?.timings?.groq;
        const ttfbTiming = metadata?.timings?.["groq-ttfb"];
        if (typeof groqTiming === "number") {
            processingTimeEl.textContent = `${Math.round(groqTiming)}ms`;
        }
        if (typeof ttfbTiming === "number") {
            responseTimeEl.textContent = `${Math.round(ttfbTiming)}ms`;
        }
    }

    function updateUsage(usage, durationMs) {
        if (!usage) {
            return;
        }

        const completionTokens = usage.completion_tokens ?? 0;
        const promptTokens = usage.prompt_tokens ?? 0;
        const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
        totalTokensEl.textContent = `${totalTokens}`;

        if (durationMs > 0 && completionTokens > 0) {
            const perSecond = completionTokens / (durationMs / 1000);
            tokensRateEl.textContent = perSecond.toFixed(1);
        }

        const tokenCap = 1024;
        const widthPercent = Math.min(100, Math.round((totalTokens / tokenCap) * 100));
        progressFillEl.style.width = `${widthPercent}%`;
    }

    /**
     * @param {{ usd: number | null, source: string, breakdown?: { promptUsd: number, completionUsd: number } }} resolution
     * @param {number} sessionTotalUsd
     */
    function updateCost(resolution, sessionTotalUsd) {
        costSessionEl.textContent = formatUsd4(sessionTotalUsd);

        if (!resolution || resolution.source === "none" || resolution.usd == null) {
            costLastEl.textContent = "—";
            costSourceBadgeEl.hidden = true;
            costBreakdownEl.hidden = true;
            costDisclaimerEl.hidden = true;
            return;
        }

        costLastEl.textContent = formatUsd4(resolution.usd);
        costSourceBadgeEl.hidden = false;

        if (resolution.source === "api") {
            costSourceBadgeEl.textContent = "API";
            costSourceBadgeEl.className = "cost-source-badge cost-source-badge--api";
            costBreakdownEl.hidden = true;
            costDisclaimerEl.hidden = true;
            return;
        }

        costSourceBadgeEl.textContent = "Est.";
        costSourceBadgeEl.className = "cost-source-badge";
        costBreakdownEl.hidden = false;
        costDisclaimerEl.hidden = false;

        const b = resolution.breakdown;
        if (b) {
            costPromptEl.textContent = formatUsd4(b.promptUsd);
            costCompletionEl.textContent = formatUsd4(b.completionUsd);
        }
    }

    function updateWebSources(sources) {
        const count = Array.isArray(sources) ? sources.length : 0;
        webSearchResultsEl.textContent = `${count} source${count === 1 ? "" : "s"} indexed`;
    }

    function setStreamingActive(active) {
        streamIndicatorEl.style.opacity = active ? "1" : "0.4";
        setStreamStatus(active ? "streaming" : "idle");
    }

    return {
        resetDynamic,
        setStreamingActive,
        updateFromSettings,
        updateMetadata,
        updateUsage,
        updateCost,
        updateSessionCost,
        updateWebSources,
    };
}

export { createMetricsView };
