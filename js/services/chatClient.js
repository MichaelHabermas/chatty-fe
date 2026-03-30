import { CHAT_COMPLETIONS_PATH, DEFAULT_MODEL } from "../config.js";
import { parseSseStream, safeJsonParse } from "./sseParser.js";

function buildRequestPayload({ messages, stream, webSearchMode }) {
    return {
        model: DEFAULT_MODEL,
        messages,
        stream,
        web_search_mode: webSearchMode,
    };
}

function buildHeaders(apiKey) {
    const headers = {
        "Content-Type": "application/json",
    };

    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
}

function parseServerTiming(serverTimingHeader) {
    const timings = {};
    if (!serverTimingHeader) {
        return timings;
    }

    const entries = serverTimingHeader.split(",");
    for (const entry of entries) {
        const [nameRaw, ...parts] = entry.trim().split(";");
        if (!nameRaw) {
            continue;
        }
        const name = nameRaw.trim();
        const durationPart = parts.find((part) => part.trim().startsWith("dur="));
        if (!durationPart) {
            continue;
        }
        const duration = Number(durationPart.split("=")[1]);
        if (!Number.isNaN(duration)) {
            timings[name] = duration;
        }
    }

    return timings;
}

function getMetadataFromResponse(response, requestStartedAt) {
    const requestId = response.headers.get("X-Groq-Request-Id") || "";
    const timings = parseServerTiming(response.headers.get("Server-Timing"));
    const latencyMs = Date.now() - requestStartedAt;

    return { requestId, timings, latencyMs };
}

async function sendChatCompletion({
    baseUrl,
    apiKey,
    messages,
    stream,
    webSearchMode,
    signal,
}) {
    const requestStartedAt = Date.now();
    const response = await fetch(`${baseUrl}${CHAT_COMPLETIONS_PATH}`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(buildRequestPayload({ messages, stream, webSearchMode })),
        signal,
    });

    const metadata = getMetadataFromResponse(response, requestStartedAt);

    if (!response.ok) {
        const errorBody = await readErrorBody(response);
        const error = new Error(errorBody.message || "Request failed");
        error.status = response.status;
        error.details = errorBody;
        throw error;
    }

    if (!stream) {
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content ?? "";
        return {
            type: "complete",
            content,
            metadata,
            usage: body?.usage || null,
            webSources: body?.web_sources || [],
            model: body?.model || DEFAULT_MODEL,
        };
    }

    if (!response.body) {
        throw new Error("Streaming response body unavailable.");
    }

    return {
        type: "stream",
        metadata,
        responseBody: response.body,
    };
}

async function streamChatCompletion(streamBody, handlers = {}) {
    let usage = null;
    let model = "";
    let webSources = [];

    await parseSseStream(streamBody, {
        onEvent({ event, data }) {
            if (event === "chatty.web_sources") {
                const parsedSources = safeJsonParse(data);
                if (Array.isArray(parsedSources)) {
                    webSources = parsedSources;
                    handlers.onWebSources?.(parsedSources);
                } else if (parsedSources?.web_sources && Array.isArray(parsedSources.web_sources)) {
                    webSources = parsedSources.web_sources;
                    handlers.onWebSources?.(parsedSources.web_sources);
                }
                return;
            }

            const parsed = safeJsonParse(data);
            if (!parsed) {
                return;
            }

            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
                handlers.onTextDelta?.(delta);
            }

            if (parsed?.usage) {
                usage = parsed.usage;
                handlers.onUsage?.(parsed.usage);
            }

            if (parsed?.model) {
                model = parsed.model;
            }
        },
        onDone() {
            handlers.onDone?.();
        },
    });

    return { usage, model, webSources };
}

async function readErrorBody(response) {
    try {
        const body = await response.json();
        const message = body?.detail || body?.error?.message || body?.message;
        return { ...body, message };
    } catch {
        return { message: `HTTP ${response.status}` };
    }
}

export { sendChatCompletion, streamChatCompletion };
