/**
 * Quality Rating System
 * Treats response quality as a first-class metric alongside cost/latency
 */

/**
 * Generate quality rating SVG icon
 * Visual represents quality as a clarity peak (0-5 scale)
 */
function generateQualityIcon(rating) {
    if (!rating || rating < 1 || rating > 5) {
        return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,12 8,4 14,12"/>
            <circle cx="8" cy="4" r="1"/>
        </svg>`;
    }

    // Scale peak height by rating (1-5 maps to 30%-80% height)
    const peakY = 12 - (rating - 1) * 1.75;

    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="2,12 8,${peakY} 14,12"/>
        <circle cx="8" cy="${peakY}" r="1" fill="currentColor"/>
    </svg>`;
}

/**
 * Format quality value for display
 */
function formatQuality(rating) {
    if (!rating || rating < 1 || rating > 5) {
        return "—";
    }
    return `${Math.round(rating)}/5`;
}

/**
 * Create quality control element (inline rating UI)
 * Appears on hover, click to set 1-5 rating
 */
function createQualityRatingControl(currentRating) {
    const container = document.createElement("div");
    container.className = "quality-rating-control";

    const label = document.createElement("div");
    label.className = "quality-rating-label";
    label.textContent = "Rate";
    container.appendChild(label);

    const dots = document.createElement("div");
    dots.className = "quality-rating-dots";

    for (let i = 1; i <= 5; i++) {
        const dot = document.createElement("button");
        dot.className = `quality-rating-dot${i <= (currentRating || 0) ? " quality-rating-dot--filled" : ""}`;
        dot.setAttribute("data-rating", i);
        dot.setAttribute("type", "button");
        dot.setAttribute("aria-label", `Rate ${i} out of 5`);

        dots.appendChild(dot);
    }

    container.appendChild(dots);
    return container;
}

export { generateQualityIcon, formatQuality, createQualityRatingControl };
