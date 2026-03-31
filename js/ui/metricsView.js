import { buildDiffRows } from "../telemetry/telemetryDiff.js";

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

function groqTimingMsFromTimings(timings) {
    if (!timings || typeof timings !== "object") {
        return { processing: undefined, response: undefined };
    }
    const processing = timings.groq;
    const response = timings["groq-ttfb"];
    return {
        processing: typeof processing === "number" ? processing : undefined,
        response: typeof response === "number" ? response : undefined,
    };
}

function createTelemetryDiffCell(text, isDelta) {
    const td = document.createElement("td");
    td.className = isDelta ? "telemetry-diff__td telemetry-diff__td--delta" : "telemetry-diff__td";
    td.textContent = text;
    return td;
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
        panelEl,
        telemetryViewLabelEl,
        costSessionSparklineEl,
        costSessionSparklinePolylineEl,
        telemetryDiffEl,
        telemetryDiffBodyEl,
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

    /**
     * @param {number[]} series cumulative USD after each completed assistant turn
     */
    function updateSessionCostSparkline(series) {
        if (!costSessionSparklineEl || !costSessionSparklinePolylineEl) {
            return;
        }
        if (!Array.isArray(series) || series.length === 0) {
            costSessionSparklineEl.hidden = true;
            costSessionSparklinePolylineEl.setAttribute("points", "");
            costSessionSparklineEl.removeAttribute("aria-label");
            return;
        }

        costSessionSparklineEl.hidden = false;
        const max = Math.max(...series, 1e-12);
        const n = series.length;
        const w = 100;
        const h = 28;
        const padX = 2;
        const padY = 4;

        const coords = [];
        if (n === 1) {
            const val = series[0];
            const yNorm = max > 0 ? val / max : 0;
            const y = h - padY - yNorm * (h - 2 * padY);
            coords.push([padX, y], [w - padX, y]);
        } else {
            for (let i = 0; i < n; i += 1) {
                const x = padX + (i / (n - 1)) * (w - 2 * padX);
                const val = series[i];
                const yNorm = max > 0 ? val / max : 0;
                const y = h - padY - yNorm * (h - 2 * padY);
                coords.push([x, y]);
            }
        }

        const points = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

        costSessionSparklinePolylineEl.setAttribute("points", points);
        costSessionSparklineEl.setAttribute(
            "aria-label",
            `Cumulative session spend over ${n} completed assistant turn${n === 1 ? "" : "s"}`,
        );
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

        const { processing, response } = groqTimingMsFromTimings(metadata?.timings);
        if (processing !== undefined) {
            processingTimeEl.textContent = `${Math.round(processing)}ms`;
        }
        if (response !== undefined) {
            responseTimeEl.textContent = `${Math.round(response)}ms`;
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
        setWebSourceCount(count);
    }

    function setWebSourceCount(count) {
        const n = typeof count === "number" && count >= 0 ? count : 0;
        webSearchResultsEl.textContent = `${n} source${n === 1 ? "" : "s"} indexed`;
    }

    /**
     * @param {"live" | "history" | "empty" | "diff" | "pending"} mode
     */
    function setTelemetryViewMode(mode) {
        if (panelEl) {
            panelEl.classList.toggle("metrics-panel--history", mode === "history");
            panelEl.classList.toggle("metrics-panel--diff", mode === "diff");
        }
        if (!telemetryViewLabelEl) {
            return;
        }
        const labelByMode = {
            diff: "Comparing two replies (first vs second)",
            pending: "Shift+click another reply to compare",
            history: "Inspecting a past assistant reply",
            empty: "No requests yet",
        };
        const label = labelByMode[mode];
        if (label !== undefined) {
            telemetryViewLabelEl.classList.remove("metrics-panel__view--live");
            telemetryViewLabelEl.removeAttribute("aria-hidden");
            telemetryViewLabelEl.textContent = label;
            return;
        }
        telemetryViewLabelEl.classList.add("metrics-panel__view--live");
        telemetryViewLabelEl.setAttribute("aria-hidden", "true");
        telemetryViewLabelEl.textContent = "";
    }

    function showTelemetryDiff(leftSnap, rightSnap) {
        if (!telemetryDiffEl || !telemetryDiffBodyEl) {
            return;
        }
        telemetryDiffBodyEl.replaceChildren();
        for (const row of buildDiffRows(leftSnap, rightSnap)) {
            const tr = document.createElement("tr");
            tr.appendChild(createTelemetryDiffCell(row.label, false));
            tr.appendChild(createTelemetryDiffCell(row.a, false));
            tr.appendChild(createTelemetryDiffCell(row.b, false));
            tr.appendChild(createTelemetryDiffCell(row.delta, true));
            telemetryDiffBodyEl.appendChild(tr);
        }
        telemetryDiffEl.hidden = false;
    }

    function hideTelemetryDiff() {
        if (telemetryDiffBodyEl) {
            telemetryDiffBodyEl.replaceChildren();
        }
        if (telemetryDiffEl) {
            telemetryDiffEl.hidden = true;
        }
    }

    /**
     * Replay Telemetry from a stored assistant-turn snapshot.
     * @param {object} snapshot
     * @param {number} sessionCostUsd
     */
    function hydrateFromSnapshot(snapshot, sessionCostUsd) {
        if (!snapshot || snapshot.v !== 1) {
            resetDynamic();
            updateSessionCost(sessionCostUsd);
            return;
        }

        const meta = snapshot.metadata || {};
        const timings = meta.timings && typeof meta.timings === "object" ? meta.timings : {};
        const { processing, response } = groqTimingMsFromTimings(timings);

        modelEl.textContent = snapshot.model || "--";
        if (meta.latencyMs != null && Number.isFinite(meta.latencyMs)) {
            latencyEl.textContent = String(Math.max(0, Math.round(meta.latencyMs)));
        } else {
            latencyEl.textContent = "--";
        }
        requestIdValueEl.textContent = meta.requestId || "--";

        processingTimeEl.textContent = processing !== undefined ? `${Math.round(processing)}ms` : "--";
        responseTimeEl.textContent = response !== undefined ? `${Math.round(response)}ms` : "--";

        const resolution = snapshot.resolution || { usd: null, source: "none" };
        updateCost(resolution, sessionCostUsd);

        if (snapshot.usage && typeof snapshot.usage === "object") {
            updateUsage(snapshot.usage, snapshot.durationMs ?? 0);
        } else {
            totalTokensEl.textContent = "--";
            tokensRateEl.textContent = "--";
            progressFillEl.style.width = "0%";
        }

        setWebSourceCount(snapshot.webSourcesCount ?? 0);

        webSearchEl.textContent = snapshot.webSearchMode ?? "auto";
        streamIndicatorEl.style.opacity = "0.4";
        if (snapshot.error) {
            setStreamStatus("failed");
        } else {
            setStreamStatus("idle");
        }
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
        setWebSourceCount,
        hydrateFromSnapshot,
        setTelemetryViewMode,
        updateSessionCostSparkline,
        showTelemetryDiff,
        hideTelemetryDiff,
    };
}

export { createMetricsView };
