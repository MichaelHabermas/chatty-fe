/**
 * Vitals Card Module
 * Manages compact metric cards that appear adjacent to selected messages
 */

/**
 * SVG icon templates (minimal, monochrome)
 */
const icons = {
    latency: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="6"/>
        <path d="M8 8v-4M8 8l3 3"/>
    </svg>`,

    tokens: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="4" height="4" rx="0.5"/>
        <rect x="7" y="2" width="4" height="4" rx="0.5"/>
        <rect x="12" y="2" width="2" height="4" rx="0.5"/>
        <rect x="2" y="7" width="4" height="4" rx="0.5"/>
        <rect x="7" y="7" width="4" height="4" rx="0.5"/>
        <rect x="12" y="7" width="2" height="4" rx="0.5"/>
        <rect x="2" y="12" width="4" height="2" rx="0.5"/>
        <rect x="7" y="12" width="4" height="2" rx="0.5"/>
    </svg>`,

    webSearch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="7" cy="7" r="4.5"/>
        <path d="M11 11l3.5 3.5"/>
    </svg>`,

    cost: `<svg viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="1.5"/>
        <path d="M8 2v2.5M8 11.5v2.5M4.5 8h-2.5M13.5 8h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
};

/**
 * Create a vitals card element
 * @param {Object} metrics - { latency, tokensPerSecond, webSearchUsed, cost }
 * @returns {HTMLElement}
 */
function createVitalsCardElement(metrics) {
    const card = document.createElement("div");
    card.className = "vitals-card";

    // Latency
    const latencyMetric = document.createElement("div");
    latencyMetric.className = "vitals__metric";
    const latencyIcon = document.createElement("div");
    latencyIcon.className = "vitals__metric-icon";
    latencyIcon.innerHTML = icons.latency;
    const latencyValue = document.createElement("div");
    latencyValue.className = "vitals__metric-value";
    latencyValue.textContent = metrics.latency != null ? `${Math.round(metrics.latency)}ms` : "—";
    latencyMetric.appendChild(latencyIcon);
    latencyMetric.appendChild(latencyValue);
    card.appendChild(latencyMetric);

    // Tokens/sec
    const tokensMetric = document.createElement("div");
    tokensMetric.className = "vitals__metric";
    const tokensIcon = document.createElement("div");
    tokensIcon.className = "vitals__metric-icon";
    tokensIcon.innerHTML = icons.tokens;
    const tokensValue = document.createElement("div");
    tokensValue.className = "vitals__metric-value";
    tokensValue.textContent = metrics.tokensPerSecond != null ? `${metrics.tokensPerSecond.toFixed(1)}/s` : "—";
    tokensMetric.appendChild(tokensIcon);
    tokensMetric.appendChild(tokensValue);
    card.appendChild(tokensMetric);

    // Web Search
    if (metrics.webSearchUsed !== undefined) {
        const wsMetric = document.createElement("div");
        wsMetric.className = `vitals__metric ${metrics.webSearchUsed ? "" : "vitals__metric--inactive"}`;
        const wsIcon = document.createElement("div");
        wsIcon.className = "vitals__metric-icon";
        wsIcon.innerHTML = icons.webSearch;
        const wsValue = document.createElement("div");
        wsValue.className = "vitals__metric-value";
        wsValue.textContent = metrics.webSearchUsed ? "search" : "—";
        wsMetric.appendChild(wsIcon);
        wsMetric.appendChild(wsValue);
        card.appendChild(wsMetric);
    }

    // Cost
    const costMetric = document.createElement("div");
    costMetric.className = "vitals__metric vitals__metric--cost";
    const costIcon = document.createElement("div");
    costIcon.className = "vitals__metric-icon";
    costIcon.innerHTML = icons.cost;
    const costValue = document.createElement("div");
    costValue.className = "vitals__metric-value";
    costValue.textContent = metrics.cost != null ? `$${metrics.cost.toFixed(4)}` : "—";
    costMetric.appendChild(costIcon);
    costMetric.appendChild(costValue);
    card.appendChild(costMetric);

    return card;
}

/**
 * Create vitals card manager
 * @param {Object} options - { messagesEl, getMessageMetrics }
 * @returns {Object} - { render, clear }
 */
function createVitalsCardManager(options) {
    const { messagesEl, getMessageMetrics } = options;

    /** @type {Map<string, HTMLElement>} */
    const cardsByMessageId = new Map();

    /**
     * Render vitals card for a message
     * @param {HTMLElement} messageNode - The message DOM element
     * @param {string} messageId - The message ID
     */
    function render(messageNode, messageId) {
        // Clear any existing card
        const existingCard = cardsByMessageId.get(messageId);
        if (existingCard?.parentElement) {
            existingCard.remove();
        }

        const metrics = getMessageMetrics(messageId);
        if (!metrics) {
            return;
        }

        const card = createVitalsCardElement(metrics);
        cardsByMessageId.set(messageId, card);

        // Insert card after message-content in the message node
        const contentNode = messageNode.querySelector(".message-content");
        if (contentNode && contentNode.parentElement) {
            contentNode.parentElement.insertBefore(card, contentNode.nextSibling);
        }
    }

    /**
     * Remove vitals card for a message
     * @param {string} messageId - The message ID
     */
    function clear(messageId) {
        const card = cardsByMessageId.get(messageId);
        if (card?.parentElement) {
            card.remove();
        }
        cardsByMessageId.delete(messageId);
    }

    /**
     * Clear all vitals cards
     */
    function clearAll() {
        for (const card of cardsByMessageId.values()) {
            if (card.parentElement) {
                card.remove();
            }
        }
        cardsByMessageId.clear();
    }

    return { render, clear, clearAll };
}

export { createVitalsCardManager };
