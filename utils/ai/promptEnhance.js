/**
 * Light prompt enhancement for clearer, more accurate images.
 * Does not call AI — pure string rules (no AI quota cost).
 */

function enhanceImagePrompt(raw) {
    let prompt = String(raw || "").trim();
    if (!prompt) return prompt;

    const lower = prompt.toLowerCase();

    // Landmark-specific anchors so structures stay recognizable
    if (/\bbig\s*ben\b|\belizabeth\s*tower\b/.test(lower)) {
        if (!/gothic|clock face|parliament/i.test(prompt)) {
            prompt +=
                ", accurate Elizabeth Tower (Big Ben) in London: tall Gothic Revival stone clock tower with four illuminated clock faces, pointed spire, detailed stonework, Houses of Parliament at the base, River Thames nearby, correct architecture and proportions";
        }
    } else if (/\beiffel\s*tower\b/.test(lower)) {
        prompt +=
            ", accurate Eiffel Tower iron lattice structure, full height, Paris, correct proportions";
    } else if (/\bstatue of liberty\b/.test(lower)) {
        prompt +=
            ", accurate Statue of Liberty, copper green, torch raised, New York Harbor, correct proportions";
    } else if (/\btaj mahal\b/.test(lower)) {
        prompt +=
            ", accurate white marble Taj Mahal mausoleum, central dome, minarets, Agra, correct proportions";
    }

    // General quality suffix if the user prompt is short
    if (prompt.length < 280 && !/photorealistic|highly detailed|8k/i.test(prompt)) {
        prompt +=
            ", photorealistic, highly detailed, sharp focus, natural lighting, correct proportions, no text, no watermark";
    }

    return prompt.slice(0, 1000);
}

module.exports = { enhanceImagePrompt };
