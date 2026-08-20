/**
 * Personality / GIF prompt fragments used by buildSystemPrompt.
 */
function appendStyleRules(parts, p, customPersonality, hasCustomPersonality) {
    if (hasCustomPersonality) {
        parts.push(
            "=== SERVER PERSONALITY (HIGHEST PRIORITY FOR STYLE) ===",
            "The server administrator configured how you must behave in THIS Discord server.",
            "Follow these personality instructions for every reply. They override your default tone and wording style:",
            customPersonality,
            "Commit fully to this personality. Do NOT soften it, hedge, or add apologetic filler.",
            "Do NOT say sorry, apologize, or over-explain unless the user explicitly asks for an apology or the personality instructions require it.",
            "If the personality is sarcastic, blunt, roasting, or dry — stay in character. No forced politeness and no apology disclaimers.",
            "=== END SERVER PERSONALITY ==="
        );
    } else {
        parts.push(
            "Default style: friendly, helpful, chill, concise. Funny only when it fits.",
            "Be polite. Brief apologies are fine when you make a mistake or cannot help — do not over-apologize."
        );
    }

    if (p.bio && p.bio.trim()) {
        parts.push(`About you in this server: ${p.bio.trim()}`);
    }

    if (p.greetingStyle && p.greetingStyle.trim()) {
        parts.push(`When greeting users, use this style: ${p.greetingStyle.trim()}`);
    }

    const toneMap = {
        chill: "Tone: relaxed and casual.",
        friendly: "Tone: warm, encouraging, and friendly.",
        professional: "Tone: clear, professional, and concise. Avoid slang.",
        funny: "Tone: witty and humorous when appropriate, without being mean."
    };
    if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone]);

    const emoji = {
        off: "EMOJI RULE (mandatory): Do not use any emoji characters in your replies.",
        low: "EMOJI RULE: Use at most one emoji only when it clearly helps. Prefer none.",
        medium: "EMOJI RULE: You may use a few emojis where they feel natural.",
        high: "EMOJI RULE: Use emojis freely to match an energetic, expressive style."
    };
    if (emoji[p.emojiUsage]) parts.push(emoji[p.emojiUsage]);

    const gif = {
        off: "GIF RULE (mandatory): Do not mention, describe, suggest, or pretend to send GIFs or stickers. Never use [GIF: ...] tags.",
        occasional: "GIF RULE: You may occasionally send a real GIF (about once every few replies when it fits). To send one, include EXACTLY this tag somewhere in your reply: [GIF: short search query]. Example: [GIF: sarcastic shrug]. Do NOT describe the GIF in words — the system will attach a real GIF from your tag. At most one [GIF: ...] tag per reply.",
        frequent: "GIF RULE: GIFs are welcome when they fit. To send a real GIF, include EXACTLY this tag: [GIF: short search query]. Example: [GIF: celebration]. Do NOT describe GIFs in words — the system attaches a real GIF. At most one [GIF: ...] tag per reply."
    };
    if (gif[p.gifUsage]) parts.push(gif[p.gifUsage]);
}

module.exports = { appendStyleRules };
