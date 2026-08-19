const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a poll")
        .addStringOption(option =>
            option
                .setName("question")
                .setDescription("The poll question")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("option1")
                .setDescription("First option")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("option2")
                .setDescription("Second option")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("option3")
                .setDescription("Third option")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("option4")
                .setDescription("Fourth option")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("option5")
                .setDescription("Fifth option")
                .setRequired(false)
        ),

    async execute(interaction) {
        const question =
            interaction.options.getString("question");

        const options = [
            interaction.options.getString("option1"),
            interaction.options.getString("option2"),
            interaction.options.getString("option3"),
            interaction.options.getString("option4"),
            interaction.options.getString("option5")
        ].filter(Boolean);

        const votes = {};
        const userVotes = {};

        options.forEach((_, index) => {
            votes[index] = 0;
        });

        const getResults = () => {
            return options.map((option, index) => {
                return `${index + 1}. **${option}** — ${votes[index]} vote(s)`;
            }).join("\n");
        };

        const buttons = new ActionRowBuilder();

        options.forEach((option, index) => {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`poll_${interaction.id}_${index}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${question}`)
            .setDescription(getResults())
            .setFooter({
                text: `Poll created by ${interaction.user.tag}`
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            components: [buttons]
        });

        const message =
            await interaction.fetchReply();

        const collector =
            message.createMessageComponentCollector({
                time: 24 * 60 * 60 * 1000
            });

        collector.on("collect", async buttonInteraction => {

            const index =
                Number(
                    buttonInteraction.customId.split("_").pop()
                );

            const userId =
                buttonInteraction.user.id;

            // Remove previous vote
            if (userVotes[userId] !== undefined) {
                votes[userVotes[userId]]--;
            }

            // Add new vote
            votes[index]++;
            userVotes[userId] = index;

            const updatedEmbed =
                new EmbedBuilder()
                    .setTitle(`📊 ${question}`)
                    .setDescription(getResults())
                    .setFooter({
                        text: `Poll created by ${interaction.user.tag}`
                    })
                    .setTimestamp();

            await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [buttons]
            });
        });

        collector.on("end", async () => {

            buttons.components.forEach(button => {
                button.setDisabled(true);
            });

            const finalEmbed =
                new EmbedBuilder()
                    .setTitle(`📊 ${question}`)
                    .setDescription(getResults())
                    .setFooter({
                        text: "Poll ended"
                    })
                    .setTimestamp();

            await message.edit({
                embeds: [finalEmbed],
                components: [buttons]
            }).catch(() => {});
        });
    }
};
