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
  updateMatchAnalysisDebug,
  setMatchAnalysisVersion,
  deleteMatchById,
  deleteAllMatches,
} = require("./matchRepository");

const {
  parseMatchDraftFromParsedMessage,
} = require("./matchUtils");
const { isImageAttachment } = require("./matchMessageParser");

const MATCH_IMAGE_ANALYSIS_VERSION = 6;
const MATCH_IMAGE_ANALYSIS_ENABLED =
  String(process.env.MATCH_IMAGE_ANALYSIS_ENABLED || "false").toLowerCase() === "true";

function buildMatchWebUrl(baseUrl, slug) {
  if (!baseUrl) return `/matches/${slug}`;
  return `${String(baseUrl).replace(/\/+$/, "")}/matches/${slug}`;
}

function buildAnalysisDebugJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        error: "debug_json_serialize_failed",
        message: error.message || String(error),
      },
      null,
      2
    );
  }
}

function buildExtractionLogSummary(match, extracted, parsed) {
  return {
    slug: match.slug,
    titolo: `${match.team1} vs ${match.team2}`,
    data: match.match_date,
    serie: {
      team1: match.team1_series_score,
      team2: match.team2_series_score,
      resultLabel: match.result_label || "",
    },
    parsedMessage: {
      title: parsed?.title || "",
      dateLine: parsed?.dateLine || "",
      resultLine: parsed?.resultLine || "",
    },
    maps: Array.isArray(extracted?.maps)
      ? extracted.maps.map(map => ({
          orderIndex: map.orderIndex,
          mode: map.mode || "",
          map: map.map || map.mapName || "",
          side: map.side || map.sideName || "",
          team1Score: map.team1Score,
          team2Score: map.team2Score,
        }))
      : [],
    players: Array.isArray(extracted?.players)
      ? extracted.players.map(player => ({
          orderIndex: player.orderIndex,
          teamName: player.teamName,
          playerName: player.playerName,
          kills: player.kills,
          deaths: player.deaths,
          assists: player.assists,
          points: player.points,
          timePlayed: player.timePlayed,
          impact: player.impact,
          isMvp: Boolean(player.isMvp),
        }))
      : [],
    extractionSummary: extracted?.extractionSummary || "",
    needsReview: Boolean(extracted?.needsReview),
  };
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
    needsReview: false,
    extractionSummary: "",
  };

  if (!MATCH_IMAGE_ANALYSIS_ENABLED) {
    extracted = {
      maps: [],
      players: [],
      needsReview: false,
      extractionSummary: imageAttachments.length > 0
        ? "Analisi immagini disattivata: match pubblicato con screenshot allegati e solo dati testuali."
        : "Analisi immagini disattivata e nessuna immagine allegata.",
    };
  } else if (imageAttachments.length > 0) {
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

  const debugJson = buildAnalysisDebugJson({
    phase: "part2_completion",
    slug: match.slug,
    imageAnalysisEnabled: MATCH_IMAGE_ANALYSIS_ENABLED,
    parsedMessage: parsed,
    screenshots: imageAttachments.map(asset => ({
      url: asset.url,
      sortOrder: asset.sortOrder,
      sourceMessageId: asset.sourceMessageId,
      name: asset.name,
      contentType: asset.contentType,
    })),
    extracted,
  });

  await updateMatchAnalysisDebug(match.id, debugJson);
  console.log(
    `🧪 Parser estrazione finale ${match.slug}:`,
    JSON.stringify(buildExtractionLogSummary(match, extracted, parsed), null, 2)
  );
  console.log(`🧪 Parser JSON ${match.slug}: ${debugJson}`);

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

  if (!MATCH_IMAGE_ANALYSIS_ENABLED) {
    await updateMatchAnalysisDebug(
      match.id,
      buildAnalysisDebugJson({
        phase: "stored_match_reanalysis",
        slug: match.slug,
        imageAnalysisEnabled: false,
        skipped: "image_analysis_disabled",
      })
    );
    await setMatchAnalysisVersion(match.id, MATCH_IMAGE_ANALYSIS_VERSION);
    return {
      matchId: match.id,
      slug: match.slug,
      skipped: true,
      reason: "image_analysis_disabled",
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

    const debugJson = buildAnalysisDebugJson({
      phase: "stored_match_reanalysis",
      slug: match.slug,
      screenshots: screenshots.map(asset => ({
        url: asset.url,
        sortOrder: asset.sortOrder,
        sourceMessageId: asset.sourceMessageId,
      })),
      extracted,
    });

    await updateMatchAnalysisDebug(match.id, debugJson);
    console.log(
      `🧪 Parser estrazione finale ${match.slug}:`,
      JSON.stringify(buildExtractionLogSummary(match, extracted, null), null, 2)
    );
    console.log(`🧪 Parser JSON ${match.slug}: ${debugJson}`);

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
    await updateMatchAnalysisDebug(
      match.id,
      buildAnalysisDebugJson({
        phase: "stored_match_reanalysis_error",
        slug: match.slug,
        error: error.message || String(error),
      })
    );
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
  await replaceMatchPlayers(matchId, payload.players || []);

  if (payload.status) {
    await setMatchStatus(matchId, payload.status);
  }
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
  MATCH_IMAGE_ANALYSIS_ENABLED,
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
