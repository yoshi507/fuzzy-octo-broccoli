const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show OmniBot commands and features"),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("OmniBot Help")
            .setDescription(
                "All-in-one Discord bot · slash, prefix (`!`), and natural (`omni …`) commands."
            )
            .addFields(
                {
                    name: "AI",
                    value:
                        "`/ask` `/chat` `/aisummary` `/aihelp` `/aiassistant` " +
                        "`/aimoderate` `/aiincident` `/aisecurity` `/clearmemory` `/imagine`\n" +
                        "Natural: `omni explain photosynthesis` · Image/Video: `/imagine` (pick type) or `omni imagine image a sunset` / `omni imagine video a sunset`"
                },
                {
                    name: "Moderation",
                    value:
                        "`/ban` `/kick` `/timeout` `/warn` `/warnings` `/clearwarnings` `/clear` `/lock` `/unlock` `/automod` `/logging`"
                },
                {
                    name: "Server",
                    value:
                        "`/welcome` `/goodbye` `/autorole` `/levelsettings` `/levelrole` `/deadchat` `/dashboard` `/announce`"
                },
                {
                    name: "Appeals & support",
                    value: "`/appeal` `/appealsetup` — also use **Appeal a punishment** on the website"
                },
                {
                    name: "Fun & economy",
                    value:
                        "`/coinflip` `/dice` `/rps` `/slots` `/trivia` `/guessnumber` `/higherlower` `/daily` `/balance` `/shop` `/buy` `/inventory` `/giveaway` `/quiz`"
                },
                {
                    name: "Other",
                    value:
                        "`/translate` `/autotranslate` `/music` `/play` `/skip` `/stop` `/queue` `/advertise` `/ping` `/help`"
                }
            )
            .setFooter({
                text: "AI features share a 20-request daily limit per server · Dashboard: https://omnibot.wisp.uno"
            });

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ embeds: [embed] });
        }
        return interaction.reply({ embeds: [embed] });
    }
};
