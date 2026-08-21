/**
 * Global AI media generation queue.
 * Only ONE image/video job runs at a time to protect low-RAM hosts (Wispbyte).
 */

const QUEUE_WAIT_MESSAGE =
    "⏳ OmniBot is currently generating something. Your request has been queued.";

/** @type {{ job: Function, resolve: Function, reject: Function, label: string }[]} */
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
 * Enqueue an async job. Resolves/rejects with the job result.
 * @param {() => Promise<any>} jobFn
 * @param {string} [label]
 * @param {{ onQueued?: () => void|Promise<void> }} [opts]
 */
function enqueueGeneration(jobFn, label = "generation", opts = {}) {
    return new Promise((resolve, reject) => {
        const entry = {
            job: jobFn,
            resolve,
            reject,
            label: String(label || "generation")
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
    try {
        const result = await next.job();
        next.resolve(result);
    } catch (err) {
        next.reject(err);
    } finally {
        active = false;
        activeLabel = null;
        setImmediate(() => {
            pump();
        });
    }
}

module.exports = {
    enqueueGeneration,
    getQueueLength,
    isBusy,
    QUEUE_WAIT_MESSAGE
};
