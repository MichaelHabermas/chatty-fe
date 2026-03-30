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
    } = elements;

    function setStreamStatus(statusText) {
        streamLabelEl.textContent = statusText;
    }

    function resetDynamic() {
        latencyEl.textContent = "--";
        tokensRateEl.textContent = "--";
        totalTokensEl.textContent = "--";
        requestIdValueEl.textContent = "--";
        processingTimeEl.textContent = "--";
        responseTimeEl.textContent = "--";
        progressFillEl.style.width = "0%";
        setStreamStatus("idle");
        streamIndicatorEl.style.opacity = "0.4";
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
        updateWebSources,
    };
}

export { createMetricsView };
