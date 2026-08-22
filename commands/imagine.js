const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const {
    generateGuildImage,
    formatImageUserError,
    isImageGenerationConfigured,
    QUEUE_WAIT_MESSAGE
} = require("../utils/ai/imageGen.js");

async function safeEdit(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        return await interaction.reply(payload);
    } catch (e) {
        console.error("[imagine] Discord reply failed:", e?.message || e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagine")
        .setDescription("Generate an image (uses the server daily AI allowance)")
        .addStringOption((opt) =>
            opt
                .setName("prompt")
                .setDescription("What to generate")
                .setRequired(true)
                .setMaxLength(1000)
        ),

    async execute(interaction) {
        const prompt = interaction.options.getString("prompt", true);
        const guildId = interaction.guildId;

        if (!isImageGenerationConfigured()) {
            return interaction.reply({
                content:
                    "❌ Image generation is not configured. Set `HOME_MODE_API_URL` and `HOME_MODE_API_KEY` on the host.",
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply();
        } catch (e) {
            console.error("[imagine] defer failed:", e?.message || e);
            return;
        }

        await safeEdit(interaction, {
            content: `🖼️ Generating… **${prompt.slice(0, 120)}**\n_This usually takes under a minute._`
        });

        try {
            const { buffer, contentType } = await generateGuildImage(
                guildId,
                prompt,
                {
                    onQueued: async () => {
                        await safeEdit(interaction, {
                            content: QUEUE_WAIT_MESSAGE
                        });
                    }
                }
            );
            const ext = String(contentType || "").includes("jpeg")
                ? "jpg"
                : "png";
            const file = new AttachmentBuilder(buffer, {
                name: `omni-imagine.${ext}`
            });
            await safeEdit(interaction, {
                content: `🖼️ **${prompt.slice(0, 200)}**`,
                files: [file]
            });
        } catch (err) {
            console.error("[imagine] generation failed:", {
                code: err?.code,
                status: err?.status,
                message: err?.message
            });
            await safeEdit(interaction, {
                content: formatImageUserError(err)
            });
        }
    }
};
