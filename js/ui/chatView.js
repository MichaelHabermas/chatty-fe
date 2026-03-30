function createChatView(elements) {
    const { messagesEl, inputEl, sendBtnEl, hintEl, emptyStateEl, connectionStatusEl } = elements;

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
     */
    function addMessage(role, content, options = {}) {
        removeEmptyState();
        const node = document.createElement("div");
        node.className = `message ${role}`;

        const contentNode = document.createElement("div");
        contentNode.className = "message-content";
        contentNode.textContent = content;

        node.appendChild(contentNode);
        messagesEl.appendChild(node);
        scrollToBottom();

        const id = options.id;
        if (role === "assistant" && id && options.selectable !== false) {
            bindAssistantNode(node, id);
        }

        return {
            node,
            contentNode,
            id,
        };
    }

    function updateMessage(messageHandle, content) {
        if (!messageHandle?.contentNode) {
            return;
        }
        messageHandle.contentNode.textContent = content;
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

    /**
     * @param {(id: string, modifiers?: { shiftKey?: boolean }) => void} handler
     */
    function setOnAssistantSelect(handler) {
        onAssistantSelect = handler;
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
        clearThreadDom,
        setOnAssistantSelect,
    };
}

export { createChatView };
