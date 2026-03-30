import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
    gfm: true,
    breaks: false,
});

/**
 * @param {string} markdown
 * @returns {string}
 */
function markdownToSafeHtml(markdown) {
    const raw = marked.parse(markdown ?? "", { async: false });
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

export { markdownToSafeHtml };
