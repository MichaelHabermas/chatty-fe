function createChatView(elements) {
    const { messagesEl, inputEl, sendBtnEl, hintEl, emptyStateEl, connectionStatusEl } = elements;

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

    function addMessage(role, content) {
        removeEmptyState();
        const node = document.createElement("div");
        node.className = `message ${role}`;

        const contentNode = document.createElement("div");
        contentNode.className = "message-content";
        contentNode.textContent = content;

        node.appendChild(contentNode);
        messagesEl.appendChild(node);
        scrollToBottom();

        return {
            node,
            contentNode,
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

    return {
        addMessage,
        clearInput,
        focusInput,
        setBusy,
        setConnectionStatus,
        updateMessage,
    };
}

export { createChatView };
