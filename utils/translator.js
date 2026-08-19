/**
 * Non-AI translation helpers for OmniBot.
 * Does NOT use Groq or the AI daily request limit.
 */

const LANGUAGE_ALIASES = {
    english: "en",
    en: "en",
    spanish: "es",
    español: "es",
    espanol: "es",
    es: "es",
    french: "fr",
    français: "fr",
    francais: "fr",
    fr: "fr",
    german: "de",
    deutsch: "de",
    de: "de",
    italian: "it",
    italiano: "it",
    it: "it",
    portuguese: "pt",
    português: "pt",
    portugues: "pt",
    pt: "pt",
    brazilian: "pt",
    "brazilian portuguese": "pt",
    dutch: "nl",
    nederlands: "nl",
    nl: "nl",
    russian: "ru",
    ru: "ru",
    japanese: "ja",
    ja: "ja",
    jp: "ja",
    korean: "ko",
    ko: "ko",
    chinese: "zh-CN",
    "chinese simplified": "zh-CN",
    "simplified chinese": "zh-CN",
    mandarin: "zh-CN",
    zh: "zh-CN",
    "zh-cn": "zh-CN",
    "zh-tw": "zh-TW",
    "traditional chinese": "zh-TW",
    arabic: "ar",
    ar: "ar",
    hindi: "hi",
    hi: "hi",
    turkish: "tr",
    tr: "tr",
    polish: "pl",
    pl: "pl",
    swedish: "sv",
    sv: "sv",
    norwegian: "no",
    no: "no",
    danish: "da",
    da: "da",
    finnish: "fi",
    fi: "fi",
    greek: "el",
    el: "el",
    czech: "cs",
    cs: "cs",
    romanian: "ro",
    ro: "ro",
    hungarian: "hu",
    hu: "hu",
    thai: "th",
    th: "th",
    vietnamese: "vi",
    vi: "vi",
    indonesian: "id",
    id: "id",
    malay: "ms",
    ms: "ms",
    hebrew: "he",
    he: "he",
    ukrainian: "uk",
    uk: "uk",
    irish: "ga",
    ga: "ga",
    welsh: "cy",
    cy: "cy",
    catalan: "ca",
    ca: "ca",
    croatian: "hr",
    hr: "hr",
    serbian: "sr",
    sr: "sr",
    slovak: "sk",
    sk: "sk",
    bulgarian: "bg",
    bg: "bg",
    filipino: "tl",
    tagalog: "tl",
    tl: "tl",
    swahili: "sw",
    sw: "sw",
    persian: "fa",
    farsi: "fa",
    fa: "fa",
    urdu: "ur",
    ur: "ur",
    bengali: "bn",
    bn: "bn"
};

function resolveLanguageCode(input) {
    if (!input || typeof input !== "string") {
        return null;
    }

    const raw = input.trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();

    if (LANGUAGE_ALIASES[lower]) {
        return LANGUAGE_ALIASES[lower];
    }

    if (/^[a-z]{2}(-[a-z]{2})?$/i.test(raw)) {
        return raw.length === 2 ? raw.toLowerCase() : raw;
    }

    return null;
}

function getSupportedLanguageHint() {
    return "Examples: english, spanish, french, german, japanese, ko, zh-CN, arabic, hindi…";
}

/**
 * Free Google translate endpoint (non-AI, no API key).
 * Not Omni's Groq AI path and does not use the AI request limit.
 */
async function translateWithGoogle(text, toCode, fromCode = "auto") {
    const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
        encodeURIComponent(fromCode || "auto") +
        "&tl=" +
        encodeURIComponent(toCode) +
        "&dt=t&q=" +
        encodeURIComponent(text);

    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; OmniBot/1.0)",
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        const err = new Error(`Translation service HTTP ${response.status}`);
        err.code = "TRANSLATE_HTTP";
        throw err;
    }

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
        const err = new Error("Unexpected translation response");
        err.code = "TRANSLATE_EMPTY";
        throw err;
    }

    const translated = data[0]
        .filter(part => Array.isArray(part) && typeof part[0] === "string")
        .map(part => part[0])
        .join("");

    if (!translated) {
        const err = new Error("Empty translation");
        err.code = "TRANSLATE_EMPTY";
        throw err;
    }

    return {
        text: translated.trim(),
        from: data[2] || fromCode || "auto",
        to: toCode,
        provider: "google-gtx"
    };
}

async function translateWithMyMemory(text, toCode, fromCode = null) {
    const source = fromCode || "Autodetect";
    const langpair = `${source}|${toCode}`;
    const url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text.slice(0, 450)) +
        "&langpair=" +
        encodeURIComponent(langpair);

    const response = await fetch(url, {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        const err = new Error(`Translation service HTTP ${response.status}`);
        err.code = "TRANSLATE_HTTP";
        throw err;
    }

    const data = await response.json();
    const translated = data?.responseData?.translatedText;

    if (!translated || typeof translated !== "string") {
        const err = new Error("Empty translation response");
        err.code = "TRANSLATE_EMPTY";
        throw err;
    }

    if (/MYMEMORY WARNING|INVALID/i.test(translated)) {
        const err = new Error("Translation quota or invalid pair");
        err.code = "TRANSLATE_INVALID";
        throw err;
    }

    return {
        text: translated.trim(),
        from: fromCode || "auto",
        to: toCode,
        provider: "mymemory"
    };
}

async function translateText(text, targetLanguage, options = {}) {
    if (!text || !String(text).trim()) {
        const err = new Error("No text to translate");
        err.code = "TRANSLATE_NO_TEXT";
        throw err;
    }

    const toCode = resolveLanguageCode(targetLanguage);
    if (!toCode) {
        const err = new Error(
            `Unsupported language: "${targetLanguage}". ${getSupportedLanguageHint()}`
        );
        err.code = "TRANSLATE_UNSUPPORTED_LANG";
        throw err;
    }

    const fromCode = options.from ? resolveLanguageCode(options.from) : null;
    const input = String(text);

    try {
        return await translateWithGoogle(input, toCode, fromCode || "auto");
    } catch (primaryError) {
        try {
            return await translateWithMyMemory(input, toCode, fromCode);
        } catch (fallbackError) {
            throw primaryError.code ? primaryError : fallbackError;
        }
    }
}

module.exports = {
    translateText,
    resolveLanguageCode,
    getSupportedLanguageHint,
    LANGUAGE_ALIASES
};
