const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nick")
        .setDescription("Change or reset a member's nickname")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("nickname")
                .setDescription("New nickname, or 'reset' to remove it")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageNicknames
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const nickname =
            interaction.options.getString("nickname");

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    "❌ That user isn't in this server.",
                ephemeral: true
            });
        }

        if (user.id === interaction.guild.ownerId) {
            return interaction.reply({
                content:
                    "❌ You cannot change the server owner's nickname.",
                ephemeral: true
            });
        }

        if (!member.manageable) {
            return interaction.reply({
                content:
                    "❌ I cannot change that member's nickname. Check my role hierarchy.",
                ephemeral: true
            });
        }

        const newNickname =
            nickname.toLowerCase() === "reset"
                ? null
                : nickname;

        try {
            await member.setNickname(
                newNickname,
                `Changed by ${interaction.user.tag}`
            );

            await sendModLog(interaction.guild, {
                title: "✏️ Nickname Changed",
                description:
                    `${interaction.user} changed ${user}'s nickname to ${
                        newNickname
                            ? `**${newNickname}**`
                            : "**their username**"
                    }.`,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason:
                    newNickname
                        ? `Nickname changed to ${newNickname}`
                        : "Nickname reset"
            });

            await interaction.reply({
                content:
                    newNickname
                        ? `✏️ **${user.tag}**'s nickname is now **${newNickname}**.`
                        : `✏️ **${user.tag}**'s nickname has been reset.`,
                ephemeral: true
            });

        } catch (error) {
            console.error(
                "Nickname command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't change that member's nickname.",
                ephemeral: true
            });
        }
    }
};
