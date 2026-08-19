/**
 * Temporary startup diagnostics — identifies why the Node process exits.
 * Never logs secrets (tokens, keys, env file contents).
 */
function safeError(err) {
    if (err == null) return { message: String(err) };
    if (typeof err === "string") return { message: err };
    return {
        name: err.name,
        message: err.message || String(err),
        code: err.code,
        stack: typeof err.stack === "string" ? err.stack.split("\n").slice(0, 12).join("\n") : undefined
    };
}

function installProcessDiagnostics() {
    if (global.__omnibotDiagInstalled) return;
    global.__omnibotDiagInstalled = true;

    process.on("uncaughtException", (err) => {
        console.error("[DIAG] uncaughtException:", JSON.stringify(safeError(err), null, 2));
    });

    process.on("unhandledRejection", (reason) => {
        console.error("[DIAG] unhandledRejection:", JSON.stringify(safeError(reason), null, 2));
    });

    process.on("beforeExit", (code) => {
        console.error(
            `[DIAG] beforeExit: event loop is emptying (code=${code}). ` +
                `httpServer=${Boolean(global.__omnibotHttpServer)} ` +
                `heartbeat=${Boolean(global.__omnibotHeartbeat)}`
        );
    });

    process.on("exit", (code) => {
        console.error(`[DIAG] process exit event: code=${code} exitCode=${process.exitCode}`);
    });

    process.on("SIGTERM", () => {
        console.error("[DIAG] received SIGTERM (host is stopping the process)");
    });

    process.on("SIGINT", () => {
        console.error("[DIAG] received SIGINT");
    });

    process.on("SIGHUP", () => {
        console.error("[DIAG] received SIGHUP");
    });

    console.log(
        `[DIAG] process diagnostics installed | node=${process.version} pid=${process.pid} platform=${process.platform}`
    );
}

module.exports = { installProcessDiagnostics, safeError };
