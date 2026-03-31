function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hashString(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function buildArcPath(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return "";
    }
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const next = points[i];
        const midY = (prev.y + next.y) / 2;
        const drift = (i % 2 === 0 ? -1 : 1) * 36;
        path += ` C ${(prev.x + drift).toFixed(2)} ${midY.toFixed(2)}, ${(next.x - drift).toFixed(2)} ${midY.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
    return path;
}

function buildComparePath(left, right) {
    if (!left || !right) {
        return "";
    }
    const deltaX = right.x - left.x;
    const deltaY = right.y - left.y;
    const bend = clamp(Math.abs(deltaX) * 0.45 + 42, 42, 120);
    const controlY = left.y + deltaY / 2;
    return [
        `M ${left.x.toFixed(2)} ${left.y.toFixed(2)}`,
        `C ${(left.x + bend).toFixed(2)} ${controlY.toFixed(2)}, ${(right.x - bend).toFixed(2)} ${controlY.toFixed(2)}, ${right.x.toFixed(2)} ${right.y.toFixed(2)}`,
    ].join(" ");
}

function buildExcerpt(content) {
    const plain = String(content ?? "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/[*_>#~-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return plain.slice(0, 72) || "Untitled turn";
}

function createMemoryConstellation({
    rootEl,
    fieldEl,
    starsEl,
    linksSvgEl,
    resonancePathEl,
    comparePathEl,
    toggleBtnEl,
    onSelect,
}) {
    let isOpen = false;
    let lastPayload = null;

    function setOpen(nextOpen) {
        isOpen = Boolean(nextOpen);
        if (rootEl) {
            rootEl.hidden = !isOpen;
            rootEl.classList.toggle("memory-constellation--open", isOpen);
        }
        if (toggleBtnEl) {
            toggleBtnEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
            toggleBtnEl.setAttribute("aria-pressed", isOpen ? "true" : "false");
            toggleBtnEl.classList.toggle("settings-btn--active", isOpen);
        }
        if (fieldEl) {
            fieldEl.classList.toggle("memory-constellation__field--open", isOpen);
        }
        if (isOpen) {
            render(lastPayload);
        }
    }

    function buildNodeLayout(messages, fieldWidth, fieldHeight) {
        const padX = 72;
        const padTop = 70;
        const padBottom = 48;
        const usableHeight = Math.max(120, fieldHeight - padTop - padBottom);
        const usableWidth = Math.max(160, fieldWidth - padX * 2);

        return messages.map((message, index) => {
            const hash = hashString(message.id);
            const quality = clamp(message.quality ?? 3, 1, 5);
            const resonanceBoost = message.resonance?.excerpt ? 1 : 0;
            const cost = message.telemetrySnapshot?.resolution?.usd ?? 0;
            const costWeight = clamp(cost * 1800, 0, 1);
            const progress = messages.length <= 1 ? 0.5 : index / (messages.length - 1);
            const lane = (hash % 1000) / 1000;
            const phase = ((hash >> 4) % 628) / 100;
            const swing = Math.sin(progress * Math.PI * 2.2 + phase) * usableWidth * 0.18;
            const anchor = usableWidth * (0.18 + lane * 0.64);
            const x = clamp(padX + anchor + swing + resonanceBoost * 18 - costWeight * 10, padX, fieldWidth - padX);
            const y = padTop + usableHeight * progress;
            return {
                id: message.id,
                message,
                x,
                y,
                size: 10 + quality * 2.2 + resonanceBoost * 5 + costWeight * 4,
                quality,
            };
        });
    }

    function render(payload) {
        lastPayload = payload ?? lastPayload;
        if (!isOpen || !fieldEl || !starsEl || !linksSvgEl || !resonancePathEl || !comparePathEl) {
            return;
        }

        const data = lastPayload ?? {};
        const assistantMessages = Array.isArray(data.messages)
            ? data.messages.filter((message) => message.role === "assistant" && message.telemetrySnapshot)
            : [];

        starsEl.replaceChildren();

        if (assistantMessages.length === 0) {
            resonancePathEl.setAttribute("d", "");
            comparePathEl.setAttribute("d", "");
            const empty = document.createElement("div");
            empty.className = "memory-constellation__empty";
            empty.textContent = "No assistant turns yet. Start a conversation to light the field.";
            starsEl.appendChild(empty);
            return;
        }

        const rect = fieldEl.getBoundingClientRect();
        const width = Math.max(320, rect.width || fieldEl.clientWidth || 320);
        const height = Math.max(320, rect.height || fieldEl.clientHeight || 320);
        linksSvgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);

        const layout = buildNodeLayout(assistantMessages, width, height);
        const layoutById = new Map(layout.map((node) => [node.id, node]));
        const lastId = data.lastId ?? assistantMessages[assistantMessages.length - 1]?.id ?? null;

        for (const node of layout) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "memory-constellation__star";
            button.style.left = `${node.x}px`;
            button.style.top = `${node.y}px`;
            button.style.setProperty("--star-size", `${node.size}px`);
            button.dataset.messageId = node.id;

            const isSelected = data.selectedId === node.id || (!data.selectedId && lastId === node.id);
            const isPending = data.pendingId === node.id;
            const isCompareLeft = data.comparePair?.left === node.id;
            const isCompareRight = data.comparePair?.right === node.id;
            const isResonant = Boolean(node.message.resonance?.excerpt);
            const isLatest = lastId === node.id;

            button.classList.toggle("memory-constellation__star--selected", isSelected);
            button.classList.toggle("memory-constellation__star--pending", isPending);
            button.classList.toggle("memory-constellation__star--compare-left", isCompareLeft);
            button.classList.toggle("memory-constellation__star--compare-right", isCompareRight);
            button.classList.toggle("memory-constellation__star--resonant", isResonant);
            button.classList.toggle("memory-constellation__star--latest", isLatest);

            const core = document.createElement("span");
            core.className = "memory-constellation__star-core";
            button.appendChild(core);

            const label = document.createElement("span");
            label.className = "memory-constellation__star-label";
            label.textContent = isResonant ? buildExcerpt(node.message.resonance.excerpt) : buildExcerpt(node.message.content);
            button.appendChild(label);

            const meta = document.createElement("span");
            meta.className = "memory-constellation__star-meta";
            meta.textContent = isCompareLeft
                ? "Compare A"
                : isCompareRight
                    ? "Compare B"
                    : isLatest
                        ? "Latest reply"
                        : `Q${node.quality}`;
            button.appendChild(meta);

            button.addEventListener("click", (event) => {
                onSelect?.(node.id, { shiftKey: event.shiftKey === true, source: "constellation" });
            });

            starsEl.appendChild(button);
        }

        const resonancePoints = assistantMessages
            .filter((message) => message.resonance?.excerpt)
            .map((message) => layoutById.get(message.id))
            .filter(Boolean);
        resonancePathEl.setAttribute("d", buildArcPath(resonancePoints));

        const compareLeft = layoutById.get(data.comparePair?.left);
        const compareRight = layoutById.get(data.comparePair?.right);
        comparePathEl.setAttribute("d", buildComparePath(compareLeft, compareRight));
    }

    if (typeof ResizeObserver !== "undefined" && fieldEl) {
        const observer = new ResizeObserver(() => render(lastPayload));
        observer.observe(fieldEl);
    }

    return {
        isOpen: () => isOpen,
        setOpen,
        render,
    };
}

export { createMemoryConstellation };
