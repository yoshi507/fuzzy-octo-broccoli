/**
 * Startup diagnostics — identify why the Node process exits.
 * Never logs secrets (tokens, keys, session secrets, env dumps).
 */
function safeError(err) {
    if (err == null) return { message: String(err) };
    if (typeof err === "string") return { message: err };
    const out = {
        name: err.name,
        message: err.message || String(err),
        code: err.code
    };
    if (typeof err.stack === "string") {
        out.stack = err.stack.split("\n").slice(0, 15).join("\n");
    }
    return out;
}

function activeResourceSummary() {
    try {
        if (typeof process.getActiveResourcesInfo === "function") {
            const info = process.getActiveResourcesInfo();
            const counts = {};
            for (const t of info) counts[t] = (counts[t] || 0) + 1;
            return counts;
        }
    } catch (_) {}
    try {
        const handles = process._getActiveHandles?.() || [];
        const requests = process._getActiveRequests?.() || [];
        return {
            handles: handles.length,
            requests: requests.length,
            handleTypes: handles.map((h) => h?.constructor?.name || typeof h).slice(0, 20)
        };
    } catch (_) {
        return { unavailable: true };
    }
}

function installProcessDiagnostics() {
    if (global.__omnibotDiagInstalled) return;
    global.__omnibotDiagInstalled = true;

    const realExit = process.exit.bind(process);
    process.exit = function patchedExit(code) {
        const c = code === undefined ? 0 : code;
        console.error(`[DIAG] process.exit(${c}) was called`);
        console.error("[DIAG] process.exit stack:\n" + new Error("process.exit").stack);
        console.error("[DIAG] resources at exit():", JSON.stringify(activeResourceSummary()));
        return realExit(c);
    };

    process.on("uncaughtException", (err, origin) => {
        console.error("[DIAG] uncaughtException origin=" + origin);
        console.error("[DIAG] uncaughtException:", JSON.stringify(safeError(err), null, 2));
        console.error("[DIAG] resources:", JSON.stringify(activeResourceSummary()));
    });

    process.on("unhandledRejection", (reason) => {
        console.error(
            "[DIAG] unhandledRejection:",
            JSON.stringify(safeError(reason), null, 2)
        );
    });

    process.on("beforeExit", (code) => {
        console.error(
            `[DIAG] beforeExit: event loop becoming empty (code=${code}). ` +
                `This means no timers/sockets/servers remain. ` +
                `httpServer=${Boolean(global.__omnibotHttpServer)} ` +
                `heartbeat=${Boolean(global.__omnibotHeartbeat)}`
        );
        console.error("[DIAG] resources at beforeExit:", JSON.stringify(activeResourceSummary()));
    });

    process.on("exit", (code) => {
        console.error(
            `[DIAG] process exit event: code=${code} exitCode=${process.exitCode}`
        );
    });

    process.on("SIGTERM", () => {
        console.error(
            "[DIAG] received SIGTERM — host/panel is stopping the process (not a Discord login crash)"
        );
        console.error("[DIAG] resources at SIGTERM:", JSON.stringify(activeResourceSummary()));
    });

    process.on("SIGINT", () => {
        console.error("[DIAG] received SIGINT");
    });

    process.on("SIGHUP", () => {
        console.error("[DIAG] received SIGHUP");
    });

    console.log(
        `[DIAG] diagnostics ON | node=${process.version} pid=${process.pid} ` +
            `platform=${process.platform} cwd=${process.cwd()}`
    );
    console.log(
        `[DIAG] env flags (booleans only): PORT=${Boolean(process.env.PORT)} ` +
            `DISCORD_TOKEN=${Boolean(process.env.DISCORD_TOKEN)} ` +
            `GROQ_API_KEY=${Boolean(process.env.GROQ_API_KEY)}`
    );
}

module.exports = { installProcessDiagnostics, safeError, activeResourceSummary };
