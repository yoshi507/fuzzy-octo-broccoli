const fs = require("fs");
const path = require("path");

const dataDirectory =
    path.join(__dirname, "../../data");

const settingsFile =
    path.join(
        dataDirectory,
        "dead-chat-settings.json"
    );

function ensureStorage() {

    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, {
            recursive: true
        });
    }

    if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(
            settingsFile,
            "{}",
            "utf8"
        );
    }
}

function loadSettings() {

    ensureStorage();

    try {

        return JSON.parse(
            fs.readFileSync(
                settingsFile,
                "utf8"
            )
        );

    } catch {

        return {};
    }
}

function saveSettings(settings) {

    ensureStorage();

    fs.writeFileSync(
        settingsFile,
        JSON.stringify(
            settings,
            null,
            2
        ),
        "utf8"
    );
}

function getSettings(channelId) {

    const settings =
        loadSettings();

    return settings[channelId] || null;
}

function setSettings(
    channelId,
    settings
) {

    const all =
        loadSettings();

    all[channelId] =
        settings;

    saveSettings(all);
}

function disable(channelId) {

    const all =
        loadSettings();

    delete all[channelId];

    saveSettings(all);
}

function addTopic(
    channelId,
    topic
) {

    const all =
        loadSettings();

    if (!all[channelId]) {
        all[channelId] = {};
    }

    if (!Array.isArray(
        all[channelId].topics
    )) {
        all[channelId].topics = [];
    }

    all[channelId].topics.push(topic);

    if (
        all[channelId].topics.length > 25
    ) {

        all[channelId].topics =
            all[channelId].topics.slice(-25);
    }

    saveSettings(all);
}

function getTopics(channelId) {

    const settings =
        getSettings(channelId);

    return settings?.topics || [];
}

function listEnabledChannels() {
    const all = loadSettings();
    const out = [];
    for (const [channelId, settings] of Object.entries(all || {})) {
        if (settings && settings.enabled) {
            out.push({
                channelId,
                minutes: Number(settings.minutes) > 0 ? Number(settings.minutes) : 30,
                lastRevival: Number(settings.lastRevival) || 0,
                lastActivity: Number(settings.lastActivity) || 0,
                guildId: settings.guildId || null
            });
        }
    }
    return out;
}

function touchActivity(channelId) {
    const all = loadSettings();
    if (!all[channelId] || !all[channelId].enabled) return;
    all[channelId].lastActivity = Date.now();
    saveSettings(all);
}

module.exports = {
    getSettings,
    setSettings,
    disable,
    addTopic,
    getTopics,
    listEnabledChannels,
    touchActivity
};
