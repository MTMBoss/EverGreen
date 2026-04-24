const fs = require("fs");
const path = require("path");

const { ensureDbReady } = require("../attendance/db");
const {
  createMatchTables,
  getMatchBySlug,
  replaceMatchPlayers,
  updateMatchSummary,
  updateMatchAnalysisDebug,
  findPlayerAliasByRawName,
} = require("./matchRepository");

const DEFAULT_PLAYER_STATS_EXPORT_PATH = path.join(
  process.cwd(),
  "exports",
  "match-player-stats.json"
);

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function readPlayerStatsExport(inputPath = DEFAULT_PLAYER_STATS_EXPORT_PATH) {
  if (!fs.existsSync(inputPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

function getExportedMatchPlayerStats(slug, inputPath = DEFAULT_PLAYER_STATS_EXPORT_PATH) {
  const payload = readPlayerStatsExport(inputPath);
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  return matches.find(match => match.slug === slug) || null;
}

function countExportedPlayers(entry) {
  return flattenExportedPlayersForView(entry).length;
}

function buildExportedPlayerStatsIndex(inputPath = DEFAULT_PLAYER_STATS_EXPORT_PATH) {
  const payload = readPlayerStatsExport(inputPath);
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const index = new Map();

  for (const entry of matches) {
    index.set(entry.slug, {
      entry,
      count: countExportedPlayers(entry),
      extractedPlayers: normalizeInteger(entry.extractedPlayers) || 0,
    });
  }

  return index;
}

function flattenExportedPlayersForView(entry) {
  const players = [];

  for (const mapBlock of entry?.maps || []) {
    const orderIndex = normalizeInteger(mapBlock?.map?.orderIndex);

    for (const [teamName, teamPlayers] of Object.entries(mapBlock?.teams || {})) {
      for (const player of teamPlayers || []) {
        players.push({
          id: null,
          order_index: orderIndex,
          team_name: String(teamName || ""),
          player_name: String(player.playerName || ""),
          kills: normalizeInteger(player.kda?.kills),
          deaths: normalizeInteger(player.kda?.deaths),
          assists: normalizeInteger(player.kda?.assists),
          points: normalizeInteger(player.points),
          time_played: String(player.timePlayed || ""),
          impact: normalizeInteger(player.impact),
          is_mvp: Boolean(player.isMvp),
          member_id: null,
          resolved_player_name: "",
        });
      }
    }
  }

  return players;
}

async function flattenExportedPlayersForImport(entry) {
  const players = [];

  for (const mapBlock of entry?.maps || []) {
    const orderIndex = normalizeInteger(mapBlock?.map?.orderIndex);

    for (const [teamName, teamPlayers] of Object.entries(mapBlock?.teams || {})) {
      for (const player of teamPlayers || []) {
        const alias = await findPlayerAliasByRawName(player.playerName || "");
        players.push({
          orderIndex,
          teamName: String(teamName || ""),
          playerName: String(player.playerName || ""),
          kills: normalizeInteger(player.kda?.kills),
          deaths: normalizeInteger(player.kda?.deaths),
          assists: normalizeInteger(player.kda?.assists),
          points: normalizeInteger(player.points),
          timePlayed: String(player.timePlayed || ""),
          impact: normalizeInteger(player.impact),
          isMvp: Boolean(player.isMvp),
          memberId: alias?.member_id ?? null,
          resolvedPlayerName: alias?.resolved_player_name || "",
        });
      }
    }
  }

  return players.filter(player => player.teamName && player.playerName);
}

function buildImportDebug(entry, importedPlayers, inputPath) {
  return JSON.stringify(
    {
      phase: "bulk_player_stats_import",
      slug: entry.slug,
      title: entry.title || "",
      sourceFile: inputPath,
      importedPlayers,
      extractedPlayers: Number(entry.extractedPlayers || 0),
      importedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

async function importPlayerStatsFromExportFile({
  inputPath = DEFAULT_PLAYER_STATS_EXPORT_PATH,
  slug = "",
  limit = 0,
  includeEmpty = false,
} = {}) {
  const payload = readPlayerStatsExport(inputPath);
  if (!payload) {
    throw new Error(`File non trovato: ${inputPath}`);
  }

  let matches = Array.isArray(payload.matches) ? payload.matches : [];

  if (slug) {
    matches = matches.filter(match => match.slug === slug);
  }

  if (!includeEmpty) {
    matches = matches.filter(match => Number(match.extractedPlayers || 0) > 0);
  }

  if (limit > 0) {
    matches = matches.slice(0, limit);
  }

  await ensureDbReady();
  await createMatchTables();

  let updated = 0;
  let skipped = 0;

  for (const entry of matches) {
    const match = await getMatchBySlug(entry.slug);
    if (!match) {
      skipped += 1;
      console.warn(`⚠️ Match non trovato nel DB, salto: ${entry.slug}`);
      continue;
    }

    const players = await flattenExportedPlayersForImport(entry);
    await replaceMatchPlayers(match.id, players);

    await updateMatchSummary(match.id, {
      resultLabel: match.result_label || "",
      winnerTeam: match.winner_team || "",
      team1SeriesScore: match.team1_series_score,
      team2SeriesScore: match.team2_series_score,
      needsReview: players.length > 0,
    });

    await updateMatchAnalysisDebug(match.id, buildImportDebug(entry, players.length, inputPath));
    updated += 1;
  }

  return {
    inputPath,
    updated,
    skipped,
    totalSelected: matches.length,
  };
}

module.exports = {
  DEFAULT_PLAYER_STATS_EXPORT_PATH,
  readPlayerStatsExport,
  getExportedMatchPlayerStats,
  countExportedPlayers,
  buildExportedPlayerStatsIndex,
  flattenExportedPlayersForView,
  importPlayerStatsFromExportFile,
};
