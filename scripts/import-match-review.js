require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { ensureDbReady } = require("../attendance/db");
const {
  createMatchTables,
  createDraftMatch,
  attachPart2ToMatch,
  replaceMatchAssets,
  getMatchBySlug,
} = require("../matches/matchRepository");
const {
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

function normalizeDate(value) {
  if (!value) return null;
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;
  if (/^\d{4}-\d{2}-\d{2}T/.test(stringValue)) return stringValue.slice(0, 10);
  return stringValue;
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

function normalizeScreenshots(screenshots) {
  return Array.isArray(screenshots)
    ? screenshots
        .map((asset, index) => ({
          url: String(asset.url || ""),
          sortOrder: normalizeInteger(asset.sortOrder) ?? index + 1,
          sourceMessageId: String(asset.sourceMessageId || ""),
        }))
        .filter(asset => asset.url)
    : [];
}

function pickReviewMaps(entry, review) {
  const reviewMaps = normalizeMaps(review.maps);
  if (reviewMaps.length > 0) return reviewMaps;
  return normalizeMaps(entry.maps);
}

async function ensureMatchExists(entry, review) {
  let match = await getMatchBySlug(entry.slug);
  if (match) return match;

  await createDraftMatch({
    slug: String(entry.slug || ""),
    team1: String(entry.team1 || ""),
    team2: String(entry.team2 || ""),
    matchDate: normalizeDate(entry.matchDate),
    matchTime: String(entry.matchTime || ""),
    resultLabel: "",
    winnerTeam: "",
    team1SeriesScore: null,
    team2SeriesScore: null,
    maps: pickReviewMaps(entry, review),
    sourceGuildId: String(
      entry.source?.part1?.guildId ||
        entry.source?.part2?.guildId ||
        ""
    ),
    sourceChannelIdPart1: String(entry.source?.part1?.channelId || ""),
    sourceMessageIdPart1: String(entry.source?.part1?.messageId || ""),
    notes: String(entry.notes || "Creato da import review manuale"),
  });

  match = await getMatchBySlug(entry.slug);
  if (!match) {
    throw new Error(`Impossibile creare il match ${entry.slug}`);
  }

  return match;
}

async function syncMatchSourcesAndAssets(match, entry) {
  if (entry.source?.part2?.channelId || entry.source?.part2?.messageId) {
    await attachPart2ToMatch(match.id, {
      sourceChannelIdPart2: String(entry.source?.part2?.channelId || ""),
      sourceMessageIdPart2: String(entry.source?.part2?.messageId || ""),
      resultLabel: "",
      winnerTeam: "",
      team1SeriesScore: null,
      team2SeriesScore: null,
      needsReview: true,
    });
  }

  const screenshots = normalizeScreenshots(entry.screenshots);
  if (screenshots.length > 0) {
    await replaceMatchAssets(match.id, screenshots);
  }
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

    const match = await ensureMatchExists(entry, review);
    await syncMatchSourcesAndAssets(match, entry);

    await updateMatchManualData(match.id, {
      status: String(review.status || entry.status || match.status || "published"),
      resultLabel: String(
        review.resultLabel || entry.series?.resultLabel || ""
      ),
      winnerTeam: String(
        review.winnerTeam || entry.series?.winnerTeam || ""
      ),
      team1SeriesScore: normalizeInteger(
        review.team1SeriesScore ?? entry.series?.team1SeriesScore
      ),
      team2SeriesScore: normalizeInteger(
        review.team2SeriesScore ?? entry.series?.team2SeriesScore
      ),
      needsReview: normalizeBoolean(review.needsReview),
      maps: pickReviewMaps(entry, review),
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
