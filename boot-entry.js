// Preflight: warn if the host is out of disk (ENOSPC breaks AI, DB, and command deploy)
try {
    const fs = require("fs");
    const probe = require("path").join(process.cwd(), ".omnibot-disk-probe");
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
} catch (e) {
    if (e && (e.code === "ENOSPC" || /no space left/i.test(String(e.message || "")))) {
        console.error(
            "[Boot] ENOSPC: host disk is FULL. Free space on Wispbyte before OmniBot can save data or register commands."
        );
    } else {
        console.warn("[Boot] disk probe failed:", e?.message || e);
    }
}

/**
 * Preferred process entry on Wispbyte / npm start.
 * Binds PORT immediately (before Discord / heavy requires) so the subdomain
 * never shows "Web server isn't running" while the bot is online.
 */
require("./utils/preloadDiag.js");

const http = require("http");
const fs = require("fs");
const path = require("path");

function resolvePort() {
    const keys = ["PORT", "SERVER_PORT", "WEB_PORT", "HTTP_PORT", "APP_PORT"];
    for (const k of keys) {
        const n = Number(process.env[k]);
        if (Number.isFinite(n) && n > 0) return { port: n, source: k };
    }
    return { port: 13893, source: "default:13893" };
}

const { port, source } = resolvePort();
const dashDir = path.join(__dirname, "public", "dashboard");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
};

function safeJoin(root, reqPath) {
    const decoded = decodeURIComponent(String(reqPath || "/").split("?")[0]);
    const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(root, cleaned);
    if (!full.startsWith(root)) return null;
    return full;
}

function sendStatic(req, res) {
    let urlPath = String(req.url || "/").split("?")[0];
    if (urlPath === "/health" || urlPath === "/health/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                ok: true,
                service: "OmniBot early listener",
                discordReady: Boolean(global.__omnibotClient),
                uptime: process.uptime(),
                expressAttached: typeof global.__omnibotAppHandler === "function"
            })
        );
        return;
    }

    if (
        urlPath === "/tos" ||
        urlPath === "/tos/" ||
        urlPath === "/terms" ||
        urlPath === "/terms/"
    ) {
        urlPath = "/tos.html";
    } else if (
        urlPath === "/privacy-policy" ||
        urlPath === "/privacy-policy/" ||
        urlPath === "/privacy" ||
        urlPath === "/privacy/"
    ) {
        urlPath = "/privacy-policy.html";
    } else if (urlPath === "/" || urlPath === "") {
        urlPath = "/index.html";
    }

    const filePath = safeJoin(dashDir, urlPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        const index = path.join(dashDir, "index.html");
        if (fs.existsSync(index)) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            fs.createReadStream(index).pipe(res);
            return;
        }
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("OmniBot is starting… refresh in a moment.");
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
}

const earlyServer = http.createServer((req, res) => {
    try {
        if (typeof global.__omnibotAppHandler === "function") {
            return global.__omnibotAppHandler(req, res);
        }
        return sendStatic(req, res);
    } catch (err) {
        console.error("[EarlyHTTP] request error:", err?.message || err);
        try {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal error");
        } catch (_) {}
    }
});

earlyServer.on("error", (err) => {
    console.error("[EarlyHTTP] server error:", err?.code || err?.message || err);
});

earlyServer.listen(port, "0.0.0.0", () => {
    console.log(
        `🌐 Early web listener on 0.0.0.0:${port} (source=${source}) — dashboard available while bot loads`
    );
});

try {
    global.__omnibotHttpServer = earlyServer;
} catch (_) {}

// Full bot bootstrap (commands, events, Express API, Discord login)
require("./index.js");
