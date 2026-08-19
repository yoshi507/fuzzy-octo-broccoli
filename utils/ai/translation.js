const fs = require("fs");
const path = require("path");

const dataDirectory =
    path.join(__dirname, "../../data");

const settingsFile =
    path.join(
        dataDirectory,
        "translation-settings.json"
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

    } catch (error) {

        console.error(
            "Translation settings error:",
            error
        );

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

function getChannelSettings(
    channelId
) {

    const settings =
        loadSettings();

    return settings[channelId] || null;
}

function setChannelSettings(
    channelId,
    settings
) {

    const allSettings =
        loadSettings();

    allSettings[channelId] =
        settings;

    saveSettings(
        allSettings
    );
}

function disableChannel(
    channelId
) {

    const settings =
        loadSettings();

    delete settings[channelId];

    saveSettings(
        settings
    );
}

module.exports = {
    getChannelSettings,
    setChannelSettings,
    disableChannel
};
