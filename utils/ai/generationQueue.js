/**
 * Global AI media generation queue.
 * Only ONE image job runs at a time.
 * Every job has a hard timeout so Discord never spins forever.
 */

const { withTimeout } = require("../withTimeout.js");

const QUEUE_WAIT_MESSAGE =
    "⏳ OmniBot is currently generating something. Your request has been queued.";

/** Default max time for one generation job (ms) */
const DEFAULT_JOB_TIMEOUT_MS = 60_000;

/** @type {{ job: Function, resolve: Function, reject: Function, label: string, timeoutMs: number }[]} */
const queue = [];
let active = false;
let activeLabel = null;

function getQueueLength() {
    return queue.length + (active ? 1 : 0);
}

function isBusy() {
    return active;
}

/**
 * @param {() => Promise<any>} jobFn
 * @param {string} [label]
 * @param {{ onQueued?: () => void|Promise<void>, timeoutMs?: number }} [opts]
 */
function enqueueGeneration(jobFn, label = "generation", opts = {}) {
    return new Promise((resolve, reject) => {
        const entry = {
            job: jobFn,
            resolve,
            reject,
            label: String(label || "generation"),
            timeoutMs: Number(opts.timeoutMs) || DEFAULT_JOB_TIMEOUT_MS
        };
        queue.push(entry);

        if (active || queue.length > 1) {
            if (typeof opts.onQueued === "function") {
                Promise.resolve(opts.onQueued()).catch(() => {});
            }
        }

        pump();
    });
}

async function pump() {
    if (active) return;
    const next = queue.shift();
    if (!next) return;

    active = true;
    activeLabel = next.label;
    console.log(
        `[GenQueue] start label=${next.label} timeoutMs=${next.timeoutMs} remaining=${queue.length}`
    );
    try {
        const result = await withTimeout(
            Promise.resolve().then(() => next.job()),
            next.timeoutMs,
            next.label
        );
        next.resolve(result);
        console.log(`[GenQueue] done label=${next.label}`);
    } catch (err) {
        console.error(
            `[GenQueue] fail label=${next.label}:`,
            err?.code || "",
            err?.message || err
        );
        next.reject(err);
    } finally {
        active = false;
        activeLabel = null;
        setImmediate(() => pump());
    }
}

module.exports = {
    enqueueGeneration,
    getQueueLength,
    isBusy,
    QUEUE_WAIT_MESSAGE,
    DEFAULT_JOB_TIMEOUT_MS
};
