async function parseSseStream(stream, handlers = {}) {
    if (!stream) {
        return;
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
            dispatchFrame(frame, handlers);
        }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
        const tailFrames = buffer.split("\n\n");
        for (const frame of tailFrames) {
            dispatchFrame(frame, handlers);
        }
    }
}

function dispatchFrame(frameText, handlers) {
    const parsed = parseFrame(frameText);
    if (!parsed) {
        return;
    }

    const { event, data } = parsed;
    if (data === "[DONE]") {
        handlers.onDone?.();
        return;
    }

    handlers.onEvent?.({ event, data });
}

function parseFrame(frameText) {
    const lines = frameText.split("\n");
    let event = "message";
    const dataLines = [];

    for (const line of lines) {
        if (line.startsWith("event:")) {
            event = line.slice(6).trim() || "message";
            continue;
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    if (!dataLines.length) {
        return null;
    }

    return {
        event,
        data: dataLines.join("\n"),
    };
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export { parseSseStream, safeJsonParse };
