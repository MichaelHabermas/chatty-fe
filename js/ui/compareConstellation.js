/**
 * SVG link between two compared assistant bubbles (Turn compare).
 * Coordinates are relative to the messages scrollport (same layer as bubbles).
 */

/**
 * @param {{ messagesEl: HTMLElement, getAssistantNode: (id: string) => HTMLElement | null }} options
 */
function createCompareConstellation({ messagesEl, getAssistantNode }) {
    const svg = document.querySelector("#compare-constellation-svg");
    const pathEl = svg?.querySelector("[data-compare-path]");
    const gradientEl = svg?.querySelector("#compare-constellation-gradient");
    const nodeA = svg?.querySelector("[data-compare-node-a]");
    const nodeB = svg?.querySelector("[data-compare-node-b]");

    /** @type {{ left: string, right: string } | null} */
    let activePair = null;

    let rafId = 0;

    function scheduleDraw() {
        if (rafId) {
            return;
        }
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            draw();
        });
    }

    /**
     * Bottom center if this bubble is above the other; else top center.
     */
    function semanticAnchor(id, pairLeft, pairRight, rL, rR, containerRect) {
        const r = id === pairLeft ? rL : rR;
        const other = id === pairLeft ? rR : rL;
        const isUpper = r.top <= other.top;
        const cx = (r.left + r.right) / 2 - containerRect.left;
        if (isUpper) {
            return { x: cx, y: r.bottom - containerRect.top };
        }
        return { x: cx, y: r.top - containerRect.top };
    }

    function clearVisual() {
        if (pathEl) {
            pathEl.setAttribute("d", "");
        }
        if (svg) {
            svg.classList.remove("compare-constellation--active");
            svg.style.opacity = "0";
        }
        if (nodeA) {
            nodeA.setAttribute("opacity", "0");
        }
        if (nodeB) {
            nodeB.setAttribute("opacity", "0");
        }
    }

    function draw() {
        if (!svg || !pathEl || !messagesEl) {
            return;
        }
        const pair = activePair;
        if (!pair) {
            clearVisual();
            return;
        }

        const nodeLeft = getAssistantNode(pair.left);
        const nodeRight = getAssistantNode(pair.right);
        const elLeft = nodeLeft?.querySelector(".message-content");
        const elRight = nodeRight?.querySelector(".message-content");
        if (!elLeft || !elRight) {
            clearVisual();
            return;
        }

        const rL = elLeft.getBoundingClientRect();
        const rR = elRight.getBoundingClientRect();
        const c = messagesEl.getBoundingClientRect();

        if (rL.width < 2 || rR.width < 2 || c.width < 2) {
            clearVisual();
            return;
        }

        const leftIsUpper = rL.top <= rR.top;
        const upperRect = leftIsUpper ? rL : rR;
        const lowerRect = leftIsUpper ? rR : rL;

        const x1 = (upperRect.left + upperRect.right) / 2 - c.left;
        const y1 = upperRect.bottom - c.top;
        const x2 = (lowerRect.left + lowerRect.right) / 2 - c.left;
        const y2 = lowerRect.top - c.top;

        const bulge = 52;
        const midX = (x1 + x2) / 2;
        const dy = y2 - y1;
        const cp1x = midX - bulge;
        const cp1y = y1 + dy * 0.38;
        const cp2x = midX - bulge;
        const cp2y = y2 - dy * 0.38;

        const d = `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;
        pathEl.setAttribute("d", d);

        const pFirst = semanticAnchor(pair.left, pair.left, pair.right, rL, rR, c);
        const pSecond = semanticAnchor(pair.right, pair.left, pair.right, rL, rR, c);

        if (gradientEl) {
            gradientEl.setAttribute("x1", String(pFirst.x));
            gradientEl.setAttribute("y1", String(pFirst.y));
            gradientEl.setAttribute("x2", String(pSecond.x));
            gradientEl.setAttribute("y2", String(pSecond.y));
        }

        if (nodeA && nodeB) {
            nodeA.setAttribute("cx", String(pFirst.x));
            nodeA.setAttribute("cy", String(pFirst.y));
            nodeB.setAttribute("cx", String(pSecond.x));
            nodeB.setAttribute("cy", String(pSecond.y));
            nodeA.setAttribute("opacity", "0.95");
            nodeB.setAttribute("opacity", "0.95");
        }

        svg.classList.add("compare-constellation--active");
        svg.style.opacity = "1";
    }

    function hide() {
        activePair = null;
        clearVisual();
    }

    /**
     * @param {{ left: string, right: string } | null} pair
     */
    function sync(pair) {
        activePair = pair;
        if (!pair) {
            hide();
            return;
        }
        scheduleDraw();
    }

    messagesEl.addEventListener("scroll", scheduleDraw, { passive: true });
    window.addEventListener("resize", scheduleDraw);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleDraw) : null;
    ro?.observe(messagesEl);

    return { sync, hide };
}

export { createCompareConstellation };
