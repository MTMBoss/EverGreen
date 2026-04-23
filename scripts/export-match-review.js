const fs = require("fs");
const path = require("path");

const { ensureDbReady } = require("../attendance/db");
const { createMatchTables } = require("../matches/matchRepository");
const {
  getMatchList,
  getMatchDetailBySlug,
} = require("../matches/matchService");

const OUTPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "match-review-queue.json");

function toIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildManualTemplate(match) {
  return {
    apply: false,
    status: match.status === "cancelled" ? "cancelled" : "published",
    resultLabel: match.result_label || "",
    winnerTeam: match.winner_team || "",
    team1SeriesScore: match.team1_series_score,
    team2SeriesScore: match.team2_series_score,
    needsReview: false,
    maps: (match.maps || []).map(map => ({
      orderIndex: map.order_index,
      mode: map.mode || "",
      map: map.map_name || "",
      side: map.side_name || "",
      team1Score: map.team1_score,
      team2Score: map.team2_score,
    })),
    players: (match.players || []).map(player => ({
      orderIndex: player.order_index || null,
      teamName: player.team_name || "",
      playerName: player.player_name || "",
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      points: player.points,
      timePlayed: player.time_played || "",
      impact: player.impact,
      isMvp: Boolean(player.is_mvp),
    })),
  };
}

function buildExportEntry(match) {
  return {
    slug: match.slug,
    team1: match.team1,
    team2: match.team2,
    matchDate: toIso(match.match_date),
    matchTime: match.match_time || "",
    status: match.status || "",
    needsReview: Boolean(match.needs_review),
    series: {
      resultLabel: match.result_label || "",
      winnerTeam: match.winner_team || "",
      team1SeriesScore: match.team1_series_score,
      team2SeriesScore: match.team2_series_score,
    },
    maps: (match.maps || []).map(map => ({
      orderIndex: map.order_index,
      mode: map.mode || "",
      mapName: map.map_name || "",
      sideName: map.side_name || "",
      team1Score: map.team1_score,
      team2Score: map.team2_score,
    })),
    players: (match.players || []).map(player => ({
      orderIndex: player.order_index || null,
      teamName: player.team_name || "",
      playerName: player.player_name || "",
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      points: player.points,
      timePlayed: player.time_played || "",
      impact: player.impact,
      isMvp: Boolean(player.is_mvp),
    })),
    screenshots: (match.assets || [])
      .filter(asset => asset.asset_type === "screenshot")
      .map(asset => ({
        sortOrder: asset.sort_order || 0,
        url: asset.asset_url || "",
        sourceMessageId: asset.source_message_id || "",
      })),
    analysisVersion: match.analysis_version || 0,
    lastAnalyzedAt: toIso(match.last_analyzed_at),
    analysisDebug: safeParseJson(match.analysis_debug_json),
    manual_review: buildManualTemplate(match),
  };
}

async function main() {
  await ensureDbReady();
  await createMatchTables();

  const matches = await getMatchList();
  const detailedMatches = [];

  for (const match of matches) {
    const detail = await getMatchDetailBySlug(match.slug);
    if (detail) {
      detailedMatches.push(buildExportEntry(detail));
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    totalMatches: detailedMatches.length,
    instructions: [
      "Compila i dati dentro manual_review.",
      "Imposta manual_review.apply a true solo per i match da importare.",
      "Per i player usa orderIndex della mappa, teamName, playerName, kills, deaths, assists, points, timePlayed, impact, isMvp.",
      "Per reimportare usa: node scripts/import-match-review.js exports/match-review-queue.json",
    ],
    matches: detailedMatches,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  console.log(`✅ Export match review creato: ${OUTPUT_PATH}`);
  console.log(`ℹ️ Match esportati: ${detailedMatches.length}`);
}

main().catch(error => {
  console.error("❌ Errore export match review:", error);
  process.exit(1);
});
