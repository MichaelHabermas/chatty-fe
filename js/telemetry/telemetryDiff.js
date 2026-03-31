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

function totalTokensFromUsage(usage) {
    if (!usage || typeof usage !== "object") {
        return null;
    }
    const pt = usage.prompt_tokens ?? 0;
    const ct = usage.completion_tokens ?? 0;
    const total = usage.total_tokens;
    if (typeof total === "number" && Number.isFinite(total)) {
        return total;
    }
    return pt + ct;
}

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

function costUsdFromSnapshot(snapshot) {
    const res = snapshot?.resolution;
    if (!res || res.source === "none" || res.usd == null || !Number.isFinite(res.usd)) {
        return null;
    }
    return res.usd;
}

/**
 * @param {object} snapshot telemetry snapshot v1
 * @returns {object}
 */
function extractComparableFields(snapshot) {
    if (!snapshot || snapshot.v !== 1) {
        return {
            model: "—",
            cost: "—",
            costNum: null,
            latencyMs: null,
            latencyLabel: "—",
            tokens: null,
            tokensLabel: "—",
            processing: "—",
            response: "—",
            webSources: "—",
            webSourcesNum: null,
            requestId: "—",
        };
    }

    const meta = snapshot.metadata || {};
    const { processing, response } = groqTimingMsFromTimings(meta.timings);
    const usage = snapshot.usage;
    const tt = totalTokensFromUsage(usage);

    const costNum = costUsdFromSnapshot(snapshot);
    const cost = costNum != null ? formatUsd4(costNum) : "—";

    const latencyMs = meta.latencyMs != null && Number.isFinite(meta.latencyMs) ? meta.latencyMs : null;
    const latencyLabel = latencyMs != null ? `${Math.round(latencyMs)}` : "—";

    const tokensLabel = tt != null ? String(tt) : "—";

    let rid = meta.requestId || "";
    if (rid.length > 14) {
        rid = `${rid.slice(0, 8)}…${rid.slice(-4)}`;
    }
    if (!rid) {
        rid = "—";
    }

    return {
        model: snapshot.model || "—",
        cost,
        costNum,
        latencyMs,
        latencyLabel,
        tokens: tt,
        tokensLabel,
        processing: processing !== undefined ? `${Math.round(processing)}ms` : "—",
        response: response !== undefined ? `${Math.round(response)}ms` : "—",
        webSources: String(snapshot.webSourcesCount ?? 0),
        webSourcesNum:
            typeof snapshot.webSourcesCount === "number" && Number.isFinite(snapshot.webSourcesCount)
                ? snapshot.webSourcesCount
                : null,
        requestId: rid,
    };
}

/**
 * @returns {Array<{ label: string, a: string, b: string, delta: string }>}
 */
function buildDiffRows(leftSnap, rightSnap) {
    const L = extractComparableFields(leftSnap);
    const R = extractComparableFields(rightSnap);

    const rows = [
        { label: "Model", a: L.model, b: R.model, delta: L.model === R.model ? "same" : "—" },
        {
            label: "Cost",
            a: L.cost,
            b: R.cost,
            delta: formatDeltaUsd(L.costNum, R.costNum),
        },
        {
            label: "Latency (ms)",
            a: L.latencyLabel,
            b: R.latencyLabel,
            delta: formatDeltaNumber(L.latencyMs, R.latencyMs, 0, "ms"),
        },
        {
            label: "Total tokens",
            a: L.tokensLabel,
            b: R.tokensLabel,
            delta: formatDeltaNumber(L.tokens, R.tokens, 0, ""),
        },
        { label: "Processing", a: L.processing, b: R.processing, delta: "—" },
        { label: "Response (TTFB)", a: L.response, b: R.response, delta: "—" },
        {
            label: "Web sources",
            a: L.webSources,
            b: R.webSources,
            delta: formatDeltaNumber(L.webSourcesNum, R.webSourcesNum, 0, ""),
        },
        { label: "Request ID", a: L.requestId, b: R.requestId, delta: "—" },
    ];

    return rows;
}

/**
 * Build diff rows with quality data
 */
function buildDiffRowsWithQuality(leftSnap, rightSnap, leftQuality, rightQuality) {
    const rows = buildDiffRows(leftSnap, rightSnap);

    if (leftQuality != null || rightQuality != null) {
        const leftQualityLabel = leftQuality != null ? `${Math.round(leftQuality)}/5` : "—";
        const rightQualityLabel = rightQuality != null ? `${Math.round(rightQuality)}/5` : "—";
        rows.push({
            label: "Quality",
            a: leftQualityLabel,
            b: rightQualityLabel,
            delta: formatDeltaNumber(leftQuality, rightQuality, 1, ""),
            isQuality: true,
        });
    }

    return rows;
}

function formatDeltaUsd(a, b) {
    if (a == null && b == null) {
        return "—";
    }
    const x = a ?? 0;
    const y = b ?? 0;
    const d = y - x;
    if (Math.abs(d) < 1e-12) {
        return "same";
    }
    const sign = d > 0 ? "+" : "";
    return `${sign}${formatUsd4(d)}`;
}

function formatDeltaNumber(a, b, decimals, suffix) {
    if (a == null && b == null) {
        return "—";
    }
    if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) {
        return "—";
    }
    const d = b - a;
    if (Math.abs(d) < 1e-9) {
        return "same";
    }
    const sign = d > 0 ? "+" : "";
    const n = decimals > 0 ? d.toFixed(decimals) : String(Math.round(d));
    return `${sign}${n}${suffix}`;
}

export { buildDiffRows, buildDiffRowsWithQuality, extractComparableFields };
