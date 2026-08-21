const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const {
    generateGuildImage,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT
} = require("../utils/ai/imageGen.js");
const {
    generateGuildVideo,
    formatVideoUserError
} = require("../utils/ai/videoGen.js");

function normalizeTypeAndPrompt(interaction) {
    let type = (interaction.options.getString("type") || "image").toLowerCase();
    let prompt = interaction.options.getString("prompt") || "";

    // Text path: "!imagine a sunset" → type token may be first word of prompt
    if (type !== "image" && type !== "video") {
        prompt = `${type} ${prompt}`.trim();
        type = "image";
    }

    const promptMatch = /^(image|video)[:\s]+(.+)$/i.exec(prompt.trim());
    if (promptMatch) {
        type = promptMatch[1].toLowerCase();
        prompt = promptMatch[2].trim();
    }

    return { type, prompt: String(prompt || "").trim() };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagine")
        .setDescription(
            "Generate an AI image or short video — uses 1 AI request"
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Image or video?")
                .setRequired(true)
                .addChoices(
                    { name: "Image generation", value: "image" },
                    { name: "Video generation", value: "video" }
                )
        )
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription("What should it show?")
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const { type, prompt } = normalizeTypeAndPrompt(interaction);

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        if (!prompt) {
            return interaction.reply({
                content: "❌ Please describe what you want to generate.",
                ephemeral: true
            });
        }

        const defer =
            typeof interaction.deferReply === "function"
                ? interaction.deferReply()
                : null;
        if (defer) await defer;

        try {
            if (type === "video") {
                const { buffer } = await generateGuildVideo(
                    interaction.guild.id,
                    prompt
                );
                const file = new AttachmentBuilder(buffer, {
                    name: "omni-video.mp4"
                });
                const remaining = getRemaining(interaction.guild.id);
                const content =
                    `🎬 **Video** (Flux + ffmpeg) · \`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                    `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

                if (interaction.deferred || interaction.replied) {
                    return interaction.editReply({ content, files: [file] });
                }
                return interaction.reply({ content, files: [file] });
            }

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
                `🖼️ **Image** (Flux) · \`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content, files: [file] });
            }
            return interaction.reply({ content, files: [file] });
        } catch (error) {
            const msg =
                type === "video"
                    ? formatVideoUserError(error)
                    : formatImageUserError(error);
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
