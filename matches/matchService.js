const {
  createDraftMatch,
  findMatchForPart2,
  attachPart2ToMatch,
  replaceMatchAssets,
  replaceMatchMapScores,
  replaceMatchPlayers,
  markMatchPublished,
  getMatchBySlug,
  listMatches,
  updateMatchSummary,
  updateMatchMaps,
  deleteMatchById,
  deleteAllMatches,
} = require("./matchRepository");

const {
  parseMatchDraftFromParsedMessage,
} = require("./matchUtils");
const { isImageAttachment } = require("./matchMessageParser");

const {
  extractMatchDataFromImages,
} = require("./matchImageParser");

function buildMatchWebUrl(baseUrl, slug) {
  if (!baseUrl) return `/matches/${slug}`;
  return `${String(baseUrl).replace(/\/+$/, "")}/matches/${slug}`;
}

async function createMatchDraftFromPart1({ parsed, message }) {
  const draft = parseMatchDraftFromParsedMessage(parsed, {
    referenceDate: message?.createdTimestamp || message?.createdAt || null,
  });

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
  const draft = parseMatchDraftFromParsedMessage(parsed, {
    referenceDate: message?.createdTimestamp || message?.createdAt || null,
  });

  if (!draft.team1 || !draft.team2) {
    throw new Error("Parte 2 non valida: titolo match mancante.");
  }

  const match = await findMatchForPart2({
    team1: draft.team1,
    team2: draft.team2,
    matchDate: draft.matchDate,
  });

  if (!match) {
    console.error("DEBUG PART2 LOOKUP FAILED:", {
      team1: draft.team1,
      team2: draft.team2,
      matchDate: draft.matchDate,
      rawTitle: parsed.title || "",
      rawDateLine: parsed.dateLine || "",
      rawResultLine: parsed.resultLine || "",
      sourceMessageId: message.id,
      sourceChannelId: message.channelId,
    });
    const details = [
      parsed.title ? `Titolo: ${parsed.title}` : "",
      parsed.dateLine ? `Data: ${parsed.dateLine}` : "",
      parsed.resultLine ? `Risultato: ${parsed.resultLine}` : "",
    ].filter(Boolean);

    throw new Error(
      `Nessuna Parte 1 collegabile trovata per questa Parte 2.\n${details.join("\n")}`
    );
  }

  const matchDetail = await getMatchBySlug(match.slug);

  const imageAttachments = [...message.attachments.values()]
    .filter(isImageAttachment)
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

  let extracted = {
    maps: [],
    players: [],
    needsReview: imageAttachments.length > 0,
    extractionSummary: "",
  };

  if (imageAttachments.length > 0) {
    try {
      extracted = await extractMatchDataFromImages(
        imageAttachments,
        matchDetail?.maps || [],
        {
          team1: match.team1,
          team2: match.team2,
        }
      );
    } catch (error) {
      console.error(`❌ Errore OCR parte 2 per ${match.slug}:`, error);
      extracted = {
        maps: [],
        players: [],
        needsReview: true,
        extractionSummary: "OCR non riuscito, match pubblicato con solo risultato serie.",
      };
    }
  } else {
    extracted = {
      maps: [],
      players: [],
      needsReview: false,
      extractionSummary: "Nessuna immagine allegata, match pubblicato con solo risultato serie.",
    };
  }

  if (Array.isArray(extracted.maps) && extracted.maps.length > 0) {
    await replaceMatchMapScores(match.id, extracted.maps);
  }

  if (Array.isArray(extracted.players) && extracted.players.length > 0) {
    await replaceMatchPlayers(match.id, extracted.players);
  }

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

async function updateMatchManualData(matchId, payload) {
  await updateMatchSummary(matchId, {
    resultLabel: payload.resultLabel,
    winnerTeam: payload.winnerTeam,
    team1SeriesScore: payload.team1SeriesScore,
    team2SeriesScore: payload.team2SeriesScore,
    needsReview: payload.needsReview,
  });

  await updateMatchMaps(matchId, payload.maps || []);
}

async function removeMatchById(matchId) {
  await deleteMatchById(matchId);
}

async function removeAllMatches() {
  await deleteAllMatches();
}

module.exports = {
  buildMatchWebUrl,
  createMatchDraftFromPart1,
  completeMatchFromPart2,
  getMatchDetailBySlug,
  getMatchList,
  updateMatchManualData,
  removeMatchById,
  removeAllMatches,
};
