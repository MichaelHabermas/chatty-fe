import { DEFAULT_MODEL } from "../config.js";
import { estimateUsdFromTokens } from "./estimateCost.js";

function pickReportedUsdFromUsage(usage) {
    if (!usage || typeof usage !== "object") {
        return null;
    }
    const candidates = [
        usage.cost_usd,
        usage.total_cost_usd,
        usage.cost,
        usage.total_cost,
    ];
    for (const v of candidates) {
        if (typeof v === "number" && Number.isFinite(v)) {
            return v;
        }
        if (typeof v === "string") {
            const n = parseFloat(v.trim());
            if (Number.isFinite(n)) {
                return n;
            }
        }
    }
    return null;
}

/**
 * @param {{ usage: object | null, metadata: object | null, model?: string }} args
 * @returns {{
 *   usd: number | null,
 *   source: "api" | "estimate" | "none",
 *   breakdown?: { promptUsd: number, completionUsd: number, totalUsd: number },
 * }}
 */
function resolveRequestCost({ usage, metadata, model }) {
    const resolvedModel = model || DEFAULT_MODEL;

    const headerUsd = metadata?.costUsd;
    if (typeof headerUsd === "number" && Number.isFinite(headerUsd)) {
        return { usd: headerUsd, source: "api" };
    }

    const reported = pickReportedUsdFromUsage(usage);
    if (reported != null) {
        return { usd: reported, source: "api" };
    }

    if (!usage || typeof usage !== "object") {
        return { usd: null, source: "none" };
    }

    const completionTokens = usage.completion_tokens ?? 0;
    const promptTokens = usage.prompt_tokens ?? 0;
    const breakdown = estimateUsdFromTokens(resolvedModel, promptTokens, completionTokens);
    if (breakdown.totalUsd <= 0 && promptTokens === 0 && completionTokens === 0) {
        return { usd: null, source: "none" };
    }

    return {
        usd: breakdown.totalUsd,
        source: "estimate",
        breakdown,
    };
}

export { pickReportedUsdFromUsage, resolveRequestCost };
