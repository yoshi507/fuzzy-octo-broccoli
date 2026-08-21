const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const {
    generateGuildImage,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT
} = require("../utils/ai/imageGen.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagine")
        .setDescription("Generate an image with AI (Flux) — uses 1 AI request")
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription("What should the image show?")
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const prompt = interaction.options.getString("prompt", true);

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        const defer =
            typeof interaction.deferReply === "function"
                ? interaction.deferReply()
                : null;
        if (defer) await defer;

        try {
            const { buffer, contentType } = await generateGuildImage(
                interaction.guild.id,
                prompt
            );

            const ext = contentType.includes("png")
                ? "png"
                : contentType.includes("webp")
                  ? "webp"
                  : "jpg";
            const file = new AttachmentBuilder(buffer, {
                name: `omni-flux.${ext}`
            });

            const remaining = getRemaining(interaction.guild.id);
            const content =
                `🖼️ **Flux** · \`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content, files: [file] });
            }
            return interaction.reply({ content, files: [file] });
        } catch (error) {
            const msg = formatImageUserError(error);
            try {
                if (interaction.deferred || interaction.replied) {
                    return interaction.editReply(msg);
                }
                return interaction.reply({ content: msg, ephemeral: true });
            } catch {
                console.error(
                    "imagine error:",
                    error?.code || error?.message || error
                );
            }
        }
    }
};
