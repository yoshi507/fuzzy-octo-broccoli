const { readGuildFeature, writeGuildFeature } = require("./guildFeatureStore.js");

function getConfig(guildId) {
    return readGuildFeature("forumHelp", guildId, {
        enabled: false,
        channelIds: [],
        autoReply: true,
        style: "helpful"
    });
}

function setConfig(guildId, patch) {
    return writeGuildFeature("forumHelp", guildId, patch);
}

function shouldHelp(guildId, channel) {
    const cfg = getConfig(guildId);
    if (!cfg.enabled || !cfg.autoReply) return false;
    if (!channel) return false;
    const isForum =
        channel.type === 15 ||
        channel.parent?.type === 15;
    if (!isForum) return false;
    if (cfg.channelIds?.length) {
        const forumId = channel.type === 15 ? channel.id : channel.parentId;
        if (!cfg.channelIds.includes(forumId)) return false;
    }
    return true;
}

module.exports = { getConfig, setConfig, shouldHelp };
