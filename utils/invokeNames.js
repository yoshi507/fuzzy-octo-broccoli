const { BOT_INVOKE_NAMES } = require("../config/botConfig.js");
const { getPersona } = require("./persona/store.js");

const BASE_NAMES = (BOT_INVOKE_NAMES || ["omni", "omnibot"]).map((n) =>
    String(n).toLowerCase()
);

function collectInvokeNames(message) {
    const names = new Set(BASE_NAMES);
    try {
        if (message?.guild?.id) {
            const persona = getPersona(message.guild.id);
            for (const key of ["displayName", "nickname"]) {
                const v = String(persona?.[key] || "")
                    .trim()
                    .toLowerCase();
                if (v.length >= 2) names.add(v);
            }
        }
    } catch {
        /* ignore */
    }
    try {
        const me = message?.guild?.members?.me;
        if (me) {
            for (const raw of [me.nickname, me.displayName]) {
                const v = String(raw || "")
                    .trim()
                    .toLowerCase();
                if (v.length >= 2) names.add(v);
            }
        }
    } catch {
        /* ignore */
    }
    try {
        const u = message?.client?.user;
        if (u?.username && String(u.username).length >= 2) {
            names.add(String(u.username).toLowerCase());
        }
        if (u?.globalName && String(u.globalName).length >= 2) {
            names.add(String(u.globalName).toLowerCase());
        }
    } catch {
        /* ignore */
    }
    return [...names];
}

module.exports = { collectInvokeNames, BASE_NAMES };
