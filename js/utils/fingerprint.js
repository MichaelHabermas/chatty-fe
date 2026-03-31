function simpleHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function seededUnit(hash, index) {
    const x = Math.sin(hash + index) * 10000;
    return x - Math.floor(x);
}

/** @param {string} messageId @param {Record<string, unknown>} [metadata] */
function generateFingerprintSVG(messageId, metadata = {}) {
    const hash = simpleHash(JSON.stringify({ id: messageId, ...metadata }));
    const elements = [];
    const size = 24;
    const cellSize = size / 3;

    for (let i = 0; i < 9; i++) {
        const x = (i % 3) * cellSize;
        const y = Math.floor(i / 3) * cellSize;
        const rand = seededUnit(hash, i);
        const shapeType = Math.floor(rand * 3);

        let fill;
        if (rand > 0.66) {
            fill = "rgba(0, 240, 255, 0.4)";
        } else if (rand > 0.33) {
            fill = "rgba(255, 120, 200, 0.3)";
        } else {
            fill = "rgba(255, 184, 0, 0.2)";
        }

        const half = cellSize / 2;
        const third = cellSize / 3;
        const sixth = cellSize / 6;

        if (shapeType === 0) {
            elements.push(`<circle cx="${x + half}" cy="${y + half}" r="${third}" fill="${fill}"/>`);
        } else if (shapeType === 1) {
            const w = cellSize / 1.5;
            elements.push(`<rect x="${x + sixth}" y="${y + sixth}" width="${w}" height="${w}" fill="${fill}"/>`);
        } else {
            const cx = x + half;
            const cy = y + half;
            const r = third;
            elements.push(`<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}" fill="${fill}"/>`);
        }
    }

    return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${elements.join("")}</svg>`;
}

function generateFingerprintHash(messageId) {
    return simpleHash(messageId).toString(16).substring(0, 6).toUpperCase();
}

export { generateFingerprintSVG, generateFingerprintHash };
