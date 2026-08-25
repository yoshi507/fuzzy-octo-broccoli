/**
 * Disk-safe filesystem helpers.
 * ENOSPC can mean: root full, /tmp full, inode exhaustion, or container quota —
 * even when `df -h` still shows free space.
 */
const fs = require("fs");
const path = require("path");

function isDiskError(err) {
    if (!err) return false;
    const code = String(err.code || "");
    const msg = String(err.message || err || "");
    return (
        code === "ENOSPC" ||
        code === "EDQUOT" ||
        /ENOSPC|no space left on device|disk quota exceeded|EDQUOT/i.test(msg)
    );
}

function diskErrorHint() {
    return (
        "Could not write data on the host. This is usually ENOSPC / quota / inodes, " +
        "not always “zero free MB”. On Wispbyte run:\n" +
        "• `df -h` (space)\n" +
        "• `df -i` (inodes — 100% inodes also causes ENOSPC)\n" +
        "• `df -h /tmp` (tmpfs can be full while the app disk is free)\n" +
        "Then clean logs/tmp/node caches and restart."
    );
}

function safeMkdir(dir) {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch (err) {
        if (isDiskError(err)) {
            console.error("[safeFs] mkdir ENOSPC/EDQUOT:", dir, err.message);
        } else {
            console.error("[safeFs] mkdir failed:", dir, err?.message || err);
        }
        return false;
    }
}

function safeWriteFile(filePath, data, encoding = "utf8") {
    try {
        const dir = path.dirname(filePath);
        if (!safeMkdir(dir)) return false;
        fs.writeFileSync(filePath, data, encoding);
        return true;
    } catch (err) {
        if (isDiskError(err)) {
            console.error("[safeFs] write ENOSPC/EDQUOT:", filePath, err.message);
        } else {
            console.error("[safeFs] write failed:", filePath, err?.message || err);
        }
        return false;
    }
}

function safeReadJson(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(raw);
        return data && typeof data === "object" ? data : fallback;
    } catch {
        return fallback;
    }
}

module.exports = {
    isDiskError,
    diskErrorHint,
    safeMkdir,
    safeWriteFile,
    safeReadJson
};
