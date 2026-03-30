/**
 * Cumulative session spend after each completed assistant turn (matches applyCost counting).
 * @param {Array<{ role: string, telemetrySnapshot?: { v?: number, resolution?: { usd?: number | null, source?: string } } | null }>} messages
 * @returns {number[]}
 */
function computeCumulativeCostSeries(messages) {
    let running = 0;
    const series = [];
    for (const m of messages) {
        if (m.role !== "assistant" || !m.telemetrySnapshot || m.telemetrySnapshot.v !== 1) {
            continue;
        }
        const res = m.telemetrySnapshot.resolution;
        if (res && res.source !== "none" && res.usd != null && Number.isFinite(res.usd)) {
            running += res.usd;
        }
        series.push(running);
    }
    return series;
}

export { computeCumulativeCostSeries };
