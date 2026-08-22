/**
 * Race a promise against a timeout. Rejects with code TIMEOUT.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {string} [label]
 */
function withTimeout(promise, ms, label = "operation") {
    const limit = Math.max(1000, Number(ms) || 30000);
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`${label} timed out after ${Math.round(limit / 1000)}s`);
            err.code = "TIMEOUT";
            reject(err);
        }, limit);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

module.exports = { withTimeout };
