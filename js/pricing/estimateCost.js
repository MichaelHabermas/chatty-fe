/**
 * Approximate USD per 1M tokens (input / completion) for known Groq models.
 * Update when provider pricing changes; verify against https://groq.com/pricing
 */
const MODEL_RATES_USD_PER_1M = {
    "llama-3.3-70b-versatile": { promptPer1M: 0.59, completionPer1M: 0.79 },
    "llama-3.1-70b-versatile": { promptPer1M: 0.59, completionPer1M: 0.79 },
    "llama-3.1-8b-instant": { promptPer1M: 0.05, completionPer1M: 0.08 },
    "mixtral-8x7b-32768": { promptPer1M: 0.24, completionPer1M: 0.24 },
};

const DEFAULT_RATES = MODEL_RATES_USD_PER_1M["llama-3.3-70b-versatile"];

function getRatesForModel(model) {
    if (!model || typeof model !== "string") {
        return DEFAULT_RATES;
    }
    const key = model.trim().toLowerCase();
    return MODEL_RATES_USD_PER_1M[key] || DEFAULT_RATES;
}

function estimateUsdFromTokens(model, promptTokens, completionTokens) {
    const pt = Math.max(0, Math.floor(promptTokens));
    const ct = Math.max(0, Math.floor(completionTokens));
    const { promptPer1M, completionPer1M } = getRatesForModel(model);
    const promptUsd = (pt / 1_000_000) * promptPer1M;
    const completionUsd = (ct / 1_000_000) * completionPer1M;
    return {
        promptUsd,
        completionUsd,
        totalUsd: promptUsd + completionUsd,
    };
}

export { estimateUsdFromTokens, getRatesForModel, MODEL_RATES_USD_PER_1M };
