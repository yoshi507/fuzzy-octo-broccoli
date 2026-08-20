require("dotenv").config();

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
});
process.on("exit", (code) => {
    console.log(`[process] exit code=${code}`);
});

// Full bot bootstrap (commands, events, API, Discord login)
require("./bootstrap.js");
