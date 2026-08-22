/**
 * Structure prompts so subjects stay recognizable and well-lit.
 * No AI call — free string rules only.
 */

function enhanceImagePrompt(raw) {
    let prompt = String(raw || "").trim();
    if (!prompt) return prompt;

    const lower = prompt.toLowerCase();

    // Landmark-specific anchors
    if (/\bbig\s*ben\b|\belizabeth\s*tower\b/.test(lower)) {
        prompt =
            "Photorealistic photo of Big Ben (Elizabeth Tower) in London, tall Gothic Revival clock tower with four clear illuminated clock faces showing correct numerals, detailed beige stone masonry, pointed neo-Gothic spire, Houses of Parliament base, River Thames in the foreground, blue sky, sharp focus, realistic architecture, correct proportions, well-lit daytime scene";
    } else if (/\beiffel\s*tower\b/.test(lower)) {
        prompt =
            "Photorealistic photo of the Eiffel Tower in Paris, full iron lattice structure, accurate proportions, Champ de Mars, clear daylight, sharp detail";
    } else if (/\bstatue of liberty\b/.test(lower)) {
        prompt =
            "Photorealistic photo of the Statue of Liberty, green copper, torch raised, New York Harbor, correct proportions, clear daylight";
    } else if (/\btaj mahal\b/.test(lower)) {
        prompt =
            "Photorealistic photo of the Taj Mahal, white marble mausoleum, central dome, four minarets, reflecting pool, Agra, clear daylight, correct proportions";
    } else {
        // General subjects: keep user intent, force clarity and lighting
        prompt =
            `Photorealistic image of ${prompt}, clear subject in frame, well-lit, natural colors, sharp focus, correct proportions, detailed, high quality`;
    }

    // Avoid pure black / abstract failures
    if (!/well-lit|daylight|bright/i.test(prompt)) {
        prompt += ", well-lit, bright clear image, visible details";
    }

    return prompt.slice(0, 1000);
}

module.exports = { enhanceImagePrompt };
