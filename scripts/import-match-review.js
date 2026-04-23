const fs = require("fs");
const path = require("path");

const { ensureDbReady } = require("../attendance/db");
const { createMatchTables } = require("../matches/matchRepository");
const {
  getMatchDetailBySlug,
  updateMatchManualData,
} = require("../matches/matchService");

const INPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "match-review-queue.json");

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizeMaps(maps) {
  return Array.isArray(maps)
    ? maps.map(map => ({
        orderIndex: normalizeInteger(map.orderIndex),
        mode: String(map.mode || ""),
        map: String(map.map || map.mapName || ""),
        side: String(map.side || map.sideName || ""),
        team1Score: normalizeInteger(map.team1Score),
        team2Score: normalizeInteger(map.team2Score),
      }))
    : [];
}

function normalizePlayers(players) {
  return Array.isArray(players)
    ? players
        .map(player => ({
          orderIndex: normalizeInteger(player.orderIndex),
          teamName: String(player.teamName || ""),
          playerName: String(player.playerName || ""),
          kills: normalizeInteger(player.kills),
          deaths: normalizeInteger(player.deaths),
          assists: normalizeInteger(player.assists),
          points: normalizeInteger(player.points),
          timePlayed: String(player.timePlayed || ""),
          impact: normalizeInteger(player.impact),
          isMvp: normalizeBoolean(player.isMvp),
        }))
        .filter(player => player.teamName && player.playerName)
    : [];
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`File non trovato: ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const payload = JSON.parse(raw);
  const matches = Array.isArray(payload.matches) ? payload.matches : [];

  await ensureDbReady();
  await createMatchTables();

  let applied = 0;
  let skipped = 0;

  for (const entry of matches) {
    const review = entry.manual_review || {};
    if (!review.apply) {
      skipped += 1;
      continue;
    }

    const match = await getMatchDetailBySlug(entry.slug);
    if (!match) {
      console.warn(`⚠️ Match non trovato, salto: ${entry.slug}`);
      skipped += 1;
      continue;
    }

    await updateMatchManualData(match.id, {
      status: String(review.status || match.status || "published"),
      resultLabel: String(review.resultLabel || ""),
      winnerTeam: String(review.winnerTeam || ""),
      team1SeriesScore: normalizeInteger(review.team1SeriesScore),
      team2SeriesScore: normalizeInteger(review.team2SeriesScore),
      needsReview: normalizeBoolean(review.needsReview),
      maps: normalizeMaps(review.maps),
      players: normalizePlayers(review.players),
    });

    applied += 1;
    console.log(`✅ Match aggiornato da review manuale: ${entry.slug}`);
  }

  console.log(`ℹ️ Import review completato. Aggiornati: ${applied}. Saltati: ${skipped}.`);
}

main().catch(error => {
  console.error("❌ Errore import match review:", error);
  process.exit(1);
});
