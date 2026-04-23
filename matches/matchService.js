const {
  createDraftMatch,
  findMatchForPart2,
  attachPart2ToMatch,
  replaceMatchAssets,
  replaceMatchMapScores,
  replaceMatchPlayers,
  markMatchPublished,
  getMatchById,
  getMatchBySlug,
  listMatches,
  listMatchesNeedingImageReanalysis,
  updateMatchSummary,
  updateMatchMaps,
  setMatchStatus,
  setMatchAnalysisVersion,
  deleteMatchById,
  deleteAllMatches,
} = require("./matchRepository");

const {
  parseMatchDraftFromParsedMessage,
} = require("./matchUtils");
const { isImageAttachment } = require("./matchMessageParser");

const MATCH_IMAGE_ANALYSIS_VERSION = 2;

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
      const {
        extractMatchDataFromImages,
      } = require("./matchImageParser");

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
  await setMatchAnalysisVersion(match.id, MATCH_IMAGE_ANALYSIS_VERSION);

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

async function reanalyzeStoredMatchImages(matchId) {
  const match = await getMatchById(matchId);

  if (!match) {
    throw new Error("Match non trovato per la rianalisi.");
  }

  const screenshots = (match.assets || [])
    .filter(asset => asset.asset_type === "screenshot")
    .map(asset => ({
      url: asset.asset_url,
      sortOrder: asset.sort_order || 0,
      sourceMessageId: asset.source_message_id || "",
      name: "",
      contentType: "",
    }));

  if (!screenshots.length) {
    await setMatchAnalysisVersion(match.id, MATCH_IMAGE_ANALYSIS_VERSION);
    return {
      matchId: match.id,
      slug: match.slug,
      skipped: true,
      reason: "no_screenshots",
      extractedMaps: 0,
      extractedPlayers: 0,
    };
  }

  try {
    const {
      extractMatchDataFromImages,
    } = require("./matchImageParser");

    const extracted = await extractMatchDataFromImages(
      screenshots,
      match.maps || [],
      {
        team1: match.team1,
        team2: match.team2,
      }
    );

    if (Array.isArray(extracted.maps) && extracted.maps.length > 0) {
      await replaceMatchMapScores(match.id, extracted.maps);
    }

    await replaceMatchPlayers(match.id, extracted.players || []);

    await updateMatchSummary(match.id, {
      resultLabel: match.result_label || "",
      winnerTeam: match.winner_team || "",
      team1SeriesScore: match.team1_series_score,
      team2SeriesScore: match.team2_series_score,
      needsReview: Boolean(extracted.needsReview),
    });

    await setMatchAnalysisVersion(match.id, MATCH_IMAGE_ANALYSIS_VERSION);

    return {
      matchId: match.id,
      slug: match.slug,
      skipped: false,
      reason: "",
      extractedMaps: Array.isArray(extracted.maps) ? extracted.maps.length : 0,
      extractedPlayers: Array.isArray(extracted.players) ? extracted.players.length : 0,
      extractionSummary: extracted.extractionSummary || "",
    };
  } catch (error) {
    await updateMatchSummary(match.id, {
      resultLabel: match.result_label || "",
      winnerTeam: match.winner_team || "",
      team1SeriesScore: match.team1_series_score,
      team2SeriesScore: match.team2_series_score,
      needsReview: true,
    });
    await setMatchAnalysisVersion(match.id, MATCH_IMAGE_ANALYSIS_VERSION);
    throw error;
  }
}

async function getMatchesNeedingImageReanalysis(limit = 1) {
  return listMatchesNeedingImageReanalysis(MATCH_IMAGE_ANALYSIS_VERSION, limit);
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

async function setMatchStatusValue(matchId, status) {
  await setMatchStatus(matchId, status);
}

async function removeMatchById(matchId) {
  await deleteMatchById(matchId);
}

async function removeAllMatches() {
  await deleteAllMatches();
}

module.exports = {
  MATCH_IMAGE_ANALYSIS_VERSION,
  buildMatchWebUrl,
  createMatchDraftFromPart1,
  completeMatchFromPart2,
  getMatchDetailBySlug,
  getMatchList,
  reanalyzeStoredMatchImages,
  getMatchesNeedingImageReanalysis,
  updateMatchManualData,
  setMatchStatusValue,
  removeMatchById,
  removeAllMatches,
};
