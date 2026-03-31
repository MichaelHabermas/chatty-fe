import { markdownToSafeHtml } from "../render/markdownToSafeHtml.js";
import { generateFingerprintSVG, generateFingerprintHash } from "../utils/fingerprint.js";

function createChatView(elements) {
    const { messagesEl, inputEl, sendBtnEl, hintEl, connectionStatusEl } = elements;
    let emptyStateEl = elements.emptyStateEl;

    /** @type {Map<string, HTMLElement>} */
    const assistantNodesById = new Map();
    /** @type {(id: string, modifiers?: { shiftKey?: boolean }) => void} */
    let onAssistantSelect = null;

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeEmptyState() {
        if (emptyStateEl && emptyStateEl.isConnected) {
            emptyStateEl.closest(".message")?.remove();
        }
    }

    function setBusy(isBusy) {
        inputEl.disabled = isBusy;
        sendBtnEl.disabled = isBusy;
        hintEl.textContent = isBusy ? "Streaming response..." : "Press Enter to send";
    }

    function setConnectionStatus(text) {
        connectionStatusEl.textContent = text;
    }

    function setAssistantInteractionEnabled(enabled) {
        messagesEl.classList.toggle("messages--telemetry-disabled", !enabled);
    }

    function setTelemetrySelection(selectedId) {
        for (const [id, node] of assistantNodesById) {
            node.classList.toggle("message--telemetry-selected", id === selectedId);
        }
    }

    /**
     * @param {{ pendingId: string | null, leftId: string | null, rightId: string | null }} ids
     */
    function setCompareHighlight(ids) {
        const { pendingId, leftId, rightId } = ids;
        for (const [id, node] of assistantNodesById) {
            node.classList.toggle("message--compare-pending", Boolean(pendingId && id === pendingId));
            node.classList.toggle("message--compare-left", Boolean(leftId && id === leftId));
            node.classList.toggle("message--compare-right", Boolean(rightId && id === rightId));
        }
    }

    /**
     * @param {string | undefined} id
     * @param {boolean} active
     */
    function setAssistantStreaming(id, active) {
        if (!id) {
            return;
        }
        const node = assistantNodesById.get(id);
        if (!node) {
            return;
        }
        node.classList.toggle("message--streaming", active);
    }

    function bindAssistantNode(node, id) {
        assistantNodesById.set(id, node);
        node.classList.add("message--assistant-selectable");
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", "Show telemetry for this reply");

        function handleActivate(event) {
            const shiftKey = event.shiftKey === true;
            onAssistantSelect?.(id, { shiftKey });
        }

        node.addEventListener("click", handleActivate);
        node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleActivate(event);
            }
        });
    }

    /**
     * @param {"user" | "assistant"} role
     * @param {string} content
     * @param {{ id?: string, selectable?: boolean }} [options]
     * @returns {{ node: HTMLElement, contentNode: HTMLElement, id: string | undefined, role: "user" | "assistant" }}
     */
    function addMessage(role, content, options = {}) {
        removeEmptyState();
        const node = document.createElement("div");
        node.className = `message ${role}`;

        const contentNode = document.createElement("div");
        contentNode.className = "message-content";
        if (role === "assistant") {
            contentNode.innerHTML = markdownToSafeHtml(content);
        } else {
            contentNode.textContent = content;
        }

        node.appendChild(contentNode);

        const id = options.id;
        if (role === "assistant" && id) {
            const fingerprintBadge = document.createElement("div");
            fingerprintBadge.className = "message-fingerprint";

            const fingerprintVisual = document.createElement("div");
            fingerprintVisual.className = "message-fingerprint-visual";
            fingerprintVisual.innerHTML = generateFingerprintSVG(id);

            const hashText = generateFingerprintHash(id);
            const fingerprintHashEl = document.createElement("div");
            fingerprintHashEl.className = "message-fingerprint-hash";
            fingerprintHashEl.textContent = hashText;
            fingerprintHashEl.title = `Fingerprint: ${hashText}`;

            fingerprintBadge.appendChild(fingerprintVisual);
            fingerprintBadge.appendChild(fingerprintHashEl);
            node.appendChild(fingerprintBadge);
        }

        messagesEl.appendChild(node);
        scrollToBottom();

        if (role === "assistant" && id && options.selectable !== false) {
            bindAssistantNode(node, id);
        }

        return {
            node,
            contentNode,
            id,
            role,
        };
    }

    function updateMessage(messageHandle, content) {
        if (!messageHandle?.contentNode) {
            return;
        }
        if (messageHandle.role === "assistant") {
            messageHandle.contentNode.innerHTML = markdownToSafeHtml(content);
        } else {
            messageHandle.contentNode.textContent = content;
        }
        scrollToBottom();
    }

    function clearInput() {
        inputEl.value = "";
    }

    function focusInput() {
        inputEl.focus();
    }

    function clearThreadDom() {
        messagesEl.replaceChildren();
        assistantNodesById.clear();
    }

    function resetToEmptyThread() {
        messagesEl.replaceChildren();
        assistantNodesById.clear();
        const wrap = document.createElement("div");
        wrap.className = "message assistant";
        const contentNode = document.createElement("div");
        contentNode.className = "message-content";
        contentNode.id = "empty-state-message";
        contentNode.textContent = "Ask anything to start chatting.";
        wrap.appendChild(contentNode);
        messagesEl.appendChild(wrap);
        emptyStateEl = contentNode;
    }

    /**
     * @param {(id: string, modifiers?: { shiftKey?: boolean }) => void} handler
     */
    function setOnAssistantSelect(handler) {
        onAssistantSelect = handler;
    }

    /**
     * @param {string} id
     * @returns {HTMLElement | null}
     */
    function getAssistantNode(id) {
        return assistantNodesById.get(id) ?? null;
    }

    return {
        addMessage,
        clearInput,
        focusInput,
        setBusy,
        setConnectionStatus,
        updateMessage,
        setAssistantInteractionEnabled,
        setTelemetrySelection,
        setCompareHighlight,
        setAssistantStreaming,
        clearThreadDom,
        resetToEmptyThread,
        setOnAssistantSelect,
        getAssistantNode,
    };
}

export { createChatView };
