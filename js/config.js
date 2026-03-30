const DEFAULT_BASE_URL = "https://chatty-be-is9h.onrender.com";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const SETTINGS_STORAGE_KEY = "chatty.fe.settings";

const DEFAULT_SETTINGS = {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: "",
    streamEnabled: true,
    webSearchMode: "auto",
};

function getDefaultBaseUrl() {
    if (typeof window === "undefined" || !window.location?.hostname) {
        return DEFAULT_BASE_URL;
    }
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return window.location.origin.replace(/\/$/, "");
    }
    return DEFAULT_BASE_URL;
}

const ALLOWED_WEB_SEARCH_MODES = new Set(["auto", "on", "off"]);

function normalizeBaseUrl(value) {
    const raw = (value || "").trim();
    if (!raw) {
        return DEFAULT_BASE_URL;
    }

    try {
        const parsed = new URL(raw);
        return parsed.origin.replace(/\/$/, "");
    } catch {
        return DEFAULT_BASE_URL;
    }
}

function sanitizeSettings(input = {}) {
    const webSearchMode = ALLOWED_WEB_SEARCH_MODES.has(input.webSearchMode)
        ? input.webSearchMode
        : DEFAULT_SETTINGS.webSearchMode;

    return {
        baseUrl: normalizeBaseUrl(input.baseUrl),
        apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "",
        streamEnabled: Boolean(input.streamEnabled),
        webSearchMode,
    };
}

function loadSettings() {
    const defaults = {
        ...DEFAULT_SETTINGS,
        baseUrl: getDefaultBaseUrl(),
    };

    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) {
            return sanitizeSettings(defaults);
        }

        const parsed = JSON.parse(raw);
        return sanitizeSettings({ ...defaults, ...parsed });
    } catch {
        return sanitizeSettings(defaults);
    }
}

function saveSettings(nextSettings) {
    const sanitized = sanitizeSettings(nextSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    return sanitized;
}

function resetSettings() {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return sanitizeSettings({
        ...DEFAULT_SETTINGS,
        baseUrl: getDefaultBaseUrl(),
    });
}

export {
    CHAT_COMPLETIONS_PATH,
    DEFAULT_MODEL,
    DEFAULT_SETTINGS,
    getDefaultBaseUrl,
    loadSettings,
    normalizeBaseUrl,
    resetSettings,
    sanitizeSettings,
    saveSettings,
};
