const {
    createDraftMatch,
    findDraftMatchForPart2,
    attachPart2ToMatch,
    replaceMatchAssets,
    replaceMatchMapScores,
    replaceMatchPlayers,
    markMatchPublished,
    getMatchBySlug,
    listMatches,
} = require("./matchRepository");

const {
    parseMatchDraftFromParsedMessage,
} = require("./matchUtils");

const {
    extractMatchDataFromImages,
} = require("./matchImageParser");

function buildMatchWebUrl(baseUrl, slug) {
    if (!baseUrl) return `/matches/${slug}`;
    return `${String(baseUrl).replace(/\/+$/, "")}/matches/${slug}`;
}

async function createMatchDraftFromPart1({ parsed, message }) {
    const draft = parseMatchDraftFromParsedMessage(parsed);

    if (!draft.team1 || !draft.team2) {
        throw new Error("Parte 1 non valida: titolo match mancante.");
    }

    const match = await createDraftMatch({
        ...draft,
        sourceGuildId: message.guildId || "",
        sourceChannelIdPart1: message.channelId || "",
        sourceMessageIdPart1: message.id || "",
        notes: "",
    });

    return match;
}

async function completeMatchFromPart2({ parsed, message }) {
    const draft = parseMatchDraftFromParsedMessage(parsed);

    if (!draft.team1 || !draft.team2) {
        throw new Error("Parte 2 non valida: titolo match mancante.");
    }

    const match = await findDraftMatchForPart2({
        team1: draft.team1,
        team2: draft.team2,
        matchDate: draft.matchDate,
    });

    if (!match) {
        throw new Error("Nessun match draft trovato per questa Parte 2.");
    }

    const imageAttachments = [...message.attachments.values()]
        .filter(att => att.contentType?.startsWith("image/"))
        .map((att, index) => ({
            url: att.url,
            sortOrder: index + 1,
            sourceMessageId: message.id,
            name: att.name || "",
            contentType: att.contentType || "",
        }));

    await attachPart2ToMatch(match.id, {
        sourceChannelIdPart2: message.channelId || "",
        sourceMessageIdPart2: message.id || "",
        resultLabel: draft.resultLabel || "",
        winnerTeam: draft.winnerTeam || "",
        team1SeriesScore: draft.team1SeriesScore,
        team2SeriesScore: draft.team2SeriesScore,
        needsReview: true,
    });

    await replaceMatchAssets(match.id, imageAttachments);

    const extracted = await extractMatchDataFromImages(imageAttachments);

    if (Array.isArray(extracted.maps) && extracted.maps.length > 0) {
        await replaceMatchMapScores(match.id, extracted.maps);
    }

    // player parsing ancora sperimentale: per ora non salvo nel DB
    // if (Array.isArray(extracted.players) && extracted.players.length > 0) {
    //   await replaceMatchPlayers(match.id, extracted.players);
    // }
    await markMatchPublished(match.id, Boolean(extracted.needsReview));

    return {
        matchId: match.id,
        slug: match.slug,
        needsReview: Boolean(extracted.needsReview),
        extractionSummary: extracted.extractionSummary || "",
    };
}

async function getMatchDetailBySlug(slug) {
    return getMatchBySlug(slug);
}

async function getMatchList() {
    return listMatches();
}

module.exports = {
    buildMatchWebUrl,
    createMatchDraftFromPart1,
    completeMatchFromPart2,
    getMatchDetailBySlug,
    getMatchList,
};
