const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { getConfig, setConfig, DEFAULT_WORDS, normalizeWords } = require("../utils/features/swearJar.js");
const { loadDatabase } = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("swearjar")
        .setDescription("Swear jar — fine users for banned words (uses server economy)")
        .addSubcommand((s) => s.setName("status").setDescription("Show swear jar status"))
        .addSubcommand((s) =>
            s
                .setName("enable")
                .setDescription("Enable the swear jar")
                .addIntegerOption((o) =>
                    o.setName("fine").setDescription("Coins per swear (default 5)").setMinValue(0).setMaxValue(1000)
                )
        )
        .addSubcommand((s) => s.setName("disable").setDescription("Disable the swear jar"))
        .addSubcommand((s) =>
            s
                .setName("setfine")
                .setDescription("Set the fine amount")
                .addIntegerOption((o) =>
                    o.setName("amount").setDescription("Coins").setRequired(true).setMinValue(0).setMaxValue(1000)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("addword")
                .setDescription("Add a banned word")
                .addStringOption((o) => o.setName("word").setRequired(true).setDescription("Word to ban"))
        )
        .addSubcommand((s) =>
            s
                .setName("removeword")
                .setDescription("Remove a banned word")
                .addStringOption((o) => o.setName("word").setRequired(true).setDescription("Word to remove"))
        )
        .addSubcommand((s) => s.setName("words").setDescription("List banned words"))
        .addSubcommand((s) => s.setName("log").setDescription("Recent swear jar hits")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

        if (sub === "status") {
            const cfg = getConfig(guildId);
            const embed = new EmbedBuilder()
                .setTitle("🫙 Swear Jar")
                .setColor(cfg.enabled ? 0x57f287 : 0x99aab5)
                .addFields(
                    { name: "Status", value: cfg.enabled ? "Enabled" : "Disabled", inline: true },
                    { name: "Fine", value: `${cfg.fine ?? 5} coins`, inline: true },
                    { name: "Collected", value: `${cfg.totalCollected || 0} coins`, inline: true },
                    { name: "Words", value: String((cfg.words || DEFAULT_WORDS).length), inline: true }
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "log") {
            const db = loadDatabase();
            const log = db.swearJarLog?.[guildId] || [];
            if (!log.length) return interaction.reply({ content: "No recent hits.", ephemeral: true });
            const lines = log.slice(0, 10).map(
                (e, i) =>
                    `\`${i + 1}.\` <@${e.userId}> — **${e.word}** (−${e.fine}) · <t:${Math.floor(e.at / 1000)}:R>`
            );
            return interaction.reply({ content: lines.join("\n"), ephemeral: true });
        }

        if (sub === "words") {
            const cfg = getConfig(guildId);
            const words = normalizeWords(cfg.words?.length ? cfg.words : DEFAULT_WORDS);
            return interaction.reply({
                content: words.length ? words.map((w) => `\`${w}\``).join(", ") : "No words configured.",
                ephemeral: true
            });
        }

        if (!isStaff) {
            return interaction.reply({
                content: "❌ Manage Server is required for this subcommand.",
                ephemeral: true
            });
        }

        if (sub === "enable") {
            const fine = interaction.options.getInteger("fine");
            const cfg = setConfig(guildId, {
                enabled: true,
                ...(fine != null ? { fine } : {}),
                words: getConfig(guildId).words?.length ? getConfig(guildId).words : DEFAULT_WORDS
            });
            return interaction.reply(`✅ Swear jar **enabled** (fine: **${cfg.fine}** coins).`);
        }
        if (sub === "disable") {
            setConfig(guildId, { enabled: false });
            return interaction.reply("⏹️ Swear jar disabled.");
        }
        if (sub === "setfine") {
            const amount = interaction.options.getInteger("amount");
            setConfig(guildId, { fine: amount });
            return interaction.reply(`💰 Fine set to **${amount}** coins.`);
        }
        if (sub === "addword") {
            const word = interaction.options.getString("word").toLowerCase().trim();
            const cfg = getConfig(guildId);
            const words = normalizeWords([...(cfg.words || DEFAULT_WORDS), word]);
            setConfig(guildId, { words });
            return interaction.reply(`➕ Added \`${word}\`.`);
        }
        if (sub === "removeword") {
            const word = interaction.options.getString("word").toLowerCase().trim();
            const cfg = getConfig(guildId);
            const words = normalizeWords(cfg.words || DEFAULT_WORDS).filter((w) => w !== word);
            setConfig(guildId, { words });
            return interaction.reply(`➖ Removed \`${word}\`.`);
        }
        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
