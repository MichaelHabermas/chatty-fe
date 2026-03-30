/**
 * Local static server + same-origin proxy so the browser can call the Chatty API
 * without CORS errors (the Render deployment does not send Access-Control-Allow-Origin).
 *
 * Usage: node scripts/dev-server.mjs
 * Then open http://localhost:8787 — Settings → Base URL should match this origin.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.CHATTY_UPSTREAM || "https://chatty-be-is9h.onrender.com").replace(/\/$/, "");

const MIME = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

const HOP_BY_HOP = new Set([
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
]);

function contentType(filePath) {
    return MIME[path.extname(filePath)] || "application/octet-stream";
}

function safeReadBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function forwardRequestHeaders(req) {
    const out = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(key.toLowerCase())) {
            continue;
        }
        if (typeof value === "string") {
            out[key] = value;
        } else if (Array.isArray(value)) {
            out[key] = value.join(", ");
        }
    }
    return out;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/v1/") || url.pathname === "/health") {
        const target = new URL(url.pathname + url.search, `${UPSTREAM}/`);
        const headers = forwardRequestHeaders(req);
        const hasBody = req.method !== "GET" && req.method !== "HEAD";
        const body = hasBody ? await safeReadBody(req) : undefined;

        const upstreamResp = await fetch(target, {
            method: req.method,
            headers,
            body: hasBody && body.length ? body : undefined,
        });

        res.statusCode = upstreamResp.status;
        upstreamResp.headers.forEach((value, key) => {
            if (HOP_BY_HOP.has(key.toLowerCase())) {
                return;
            }
            res.setHeader(key, value);
        });

        if (upstreamResp.body) {
            const nodeStream = Readable.fromWeb(upstreamResp.body);
            await pipeline(nodeStream, res);
        } else {
            res.end();
        }
        return;
    }

    let staticPath = url.pathname === "/" ? "/index.html" : url.pathname;
    staticPath = path.normalize(staticPath);

    if (staticPath.includes("..")) {
        res.writeHead(403);
        res.end();
        return;
    }

    const resolved = path.join(ROOT, staticPath);
    if (!resolved.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
    }

    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        const fallback = path.join(ROOT, "index.html");
        if (!fs.existsSync(fallback)) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(fallback).pipe(res);
        return;
    }

    res.writeHead(200, { "Content-Type": contentType(resolved) });
    fs.createReadStream(resolved).pipe(res);
});

server.listen(PORT, () => {
    console.log(`Chatty FE: http://localhost:${PORT}`);
    console.log(`Proxy /v1/* and /health → ${UPSTREAM}`);
});
