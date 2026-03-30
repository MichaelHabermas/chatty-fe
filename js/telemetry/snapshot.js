function buildTelemetrySnapshot({
    model,
    metadata,
    usage,
    durationMs,
    resolution,
    webSources,
    webSearchMode,
    streamEnabled,
    error,
}) {
    const res = resolution || { usd: null, source: "none" };
    return {
        v: 1,
        model: model ?? null,
        metadata: {
            requestId: metadata?.requestId ?? "",
            latencyMs: metadata?.latencyMs ?? null,
            timings: metadata?.timings && typeof metadata.timings === "object" ? { ...metadata.timings } : {},
            costUsd:
                metadata?.costUsd != null && Number.isFinite(metadata.costUsd) ? metadata.costUsd : null,
        },
        usage: usage && typeof usage === "object" ? usage : null,
        durationMs: typeof durationMs === "number" && durationMs >= 0 ? durationMs : 0,
        resolution: {
            usd: res.usd,
            source: res.source,
            breakdown: res.breakdown,
        },
        webSourcesCount: Array.isArray(webSources) ? webSources.length : 0,
        webSearchMode,
        streamEnabled: Boolean(streamEnabled),
        error: Boolean(error),
    };
}

export { buildTelemetrySnapshot };
