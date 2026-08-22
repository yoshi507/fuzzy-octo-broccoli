const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const {
    generateGuildImage,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT,
    QUEUE_WAIT_MESSAGE
} = require("../utils/ai/imageGen.js");

function normalizePrompt(interaction) {
    let prompt = interaction.options.getString("prompt") || "";
    // Legacy: ignore old "image ..." / "video ..." prefixes users may still type
    const promptMatch = /^(image|video)[:\s]+(.+)$/i.exec(prompt.trim());
    if (promptMatch) {
        prompt = promptMatch[2].trim();
    }
    return String(prompt || "").trim();
}

async function safeEdit(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        return await interaction.reply(payload);
    } catch (e) {
        console.error("[imagine] Discord edit/reply failed:", e?.message || e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagine")
        .setDescription("Generate an AI image — uses 1 AI request")
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription("What should the image show?")
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const prompt = normalizePrompt(interaction);

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        if (!prompt) {
            return interaction.reply({
                content: "❌ Please describe the image you want.",
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply();
        } catch (e) {
            console.error("[imagine] defer failed:", e?.message || e);
            return;
        }

        const onQueued = async () => {
            await safeEdit(interaction, { content: QUEUE_WAIT_MESSAGE });
        };

        try {
            await safeEdit(interaction, { content: "🖼️ Generating image…" });

            const { buffer, contentType } = await generateGuildImage(
                interaction.guild.id,
                prompt,
                { onQueued }
            );

            const ext = (contentType || "").includes("png")
                ? "png"
                : (contentType || "").includes("webp")
                  ? "webp"
                  : "jpg";
            const file = new AttachmentBuilder(buffer, {
                name: `omni-image.${ext}`
            });

            const remaining = getRemaining(interaction.guild.id);
            const content =
                `🖼️ **Image** · \`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

            return safeEdit(interaction, { content, files: [file] });
        } catch (error) {
            console.error("[imagine] generation failed:", {
                code: error?.code,
                status: error?.status,
                message: error?.message,
                stack: error?.stack?.split("\n").slice(0, 4).join(" | ")
            });
            await safeEdit(interaction, {
                content: formatImageUserError(error)
            });
        }
    }
};
