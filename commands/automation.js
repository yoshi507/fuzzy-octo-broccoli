const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const store = require("../utils/automations/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("automation")
        .setDescription("Message automations (keyword triggers)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s
                .setName("add")
                .setDescription("Add a keyword automation")
                .addStringOption((o) =>
                    o.setName("trigger").setDescription("Keyword or phrase").setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("action")
                        .setDescription("What to do")
                        .setRequired(true)
                        .addChoices(
                            { name: "Reply", value: "reply" },
                            { name: "React", value: "react" }
                        )
                )
                .addStringOption((o) =>
                    o.setName("response").setDescription("Reply text or emoji").setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("match")
                        .setDescription("Match mode")
                        .addChoices(
                            { name: "Contains", value: "contains" },
                            { name: "Exact / starts with", value: "exact" }
                        )
                )
        )
        .addSubcommand((s) => s.setName("list").setDescription("List automations"))
        .addSubcommand((s) =>
            s
                .setName("remove")
                .setDescription("Remove an automation by id")
                .addStringOption((o) => o.setName("id").setRequired(true).setDescription("Automation id"))
        )
        .addSubcommand((s) =>
            s
                .setName("toggle")
                .setDescription("Enable or disable an automation")
                .addStringOption((o) => o.setName("id").setRequired(true))
                .addBooleanOption((o) => o.setName("enabled").setRequired(true))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === "add") {
            const trigger = interaction.options.getString("trigger");
            const action = interaction.options.getString("action");
            const response = interaction.options.getString("response");
            const match = interaction.options.getString("match") || "contains";
            const rule = store.add(guildId, {
                trigger,
                action,
                response: action === "react" ? "" : response,
                emoji: action === "react" ? response : null,
                match
            });
            return interaction.reply(
                `✅ Automation \`${rule.id}\` added.\nTrigger: **${rule.trigger}** (${rule.match}) → **${rule.action}**`
            );
        }
        if (sub === "list") {
            const rules = store.list(guildId);
            if (!rules.length) return interaction.reply({ content: "No automations yet.", ephemeral: true });
            const lines = rules.map(
                (r) =>
                    `\`${r.id}\` ${r.enabled ? "✅" : "⏹️"} **${r.trigger}** (${r.match}) → ${r.action}` +
                    (r.action === "reply" ? `: ${r.response.slice(0, 60)}` : r.emoji ? ` ${r.emoji}` : "")
            );
            return interaction.reply({ content: lines.join("\n").slice(0, 1900), ephemeral: true });
        }
        if (sub === "remove") {
            const id = interaction.options.getString("id");
            store.remove(guildId, id);
            return interaction.reply(`🗑️ Removed \`${id}\` (if it existed).`);
        }
        if (sub === "toggle") {
            const id = interaction.options.getString("id");
            const enabled = interaction.options.getBoolean("enabled");
            const r = store.toggle(guildId, id, enabled);
            if (!r) return interaction.reply({ content: "Not found.", ephemeral: true });
            return interaction.reply(`${enabled ? "✅ Enabled" : "⏹️ Disabled"} \`${id}\`.`);
        }
        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
