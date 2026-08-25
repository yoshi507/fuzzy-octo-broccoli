/**
 * Optional multi-process sharding entry.
 * Default Wispbyte deploy should keep using: node boot-entry.js
 *
 * Usage:
 *   SHARD_COUNT=2 node shard.js
 *   or TOTAL_SHARDS=auto node shard.js
 */
require("./utils/preloadDiag.js");
const { ShardingManager } = require("discord.js");
const path = require("path");

const token = process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error("[Sharding] Missing DISCORD_TOKEN");
    process.exit(1);
}

let totalShards = process.env.SHARD_COUNT || process.env.TOTAL_SHARDS || "auto";
if (totalShards !== "auto") {
    totalShards = Math.max(1, parseInt(totalShards, 10) || 1);
}

const manager = new ShardingManager(path.join(__dirname, "bootstrap.js"), {
    token,
    totalShards,
    respawn: true
});

manager.on("shardCreate", (shard) => {
    console.log(`[Sharding] Launched shard ${shard.id}`);
    shard.on("death", () => console.error(`[Sharding] Shard ${shard.id} died`));
    shard.on("error", (e) => console.error(`[Sharding] Shard ${shard.id} error:`, e?.message || e));
});

manager
    .spawn({ timeout: 120_000 })
    .then(() => console.log("[Sharding] All shards spawn requested"))
    .catch((e) => {
        console.error("[Sharding] spawn failed:", e?.message || e);
        process.exit(1);
    });
