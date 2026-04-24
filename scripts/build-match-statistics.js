const fs = require("fs");
const path = require("path");

const INPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "site-match-review-queue.json");
const OUTPUT_PATH =
  process.argv[3] ||
  path.join(process.cwd(), "exports", "match-statistics.json");

function getEffectiveReview(entry) {
  if (entry.manual_review && (entry.manual_review.apply || entry.manual_review.maps || entry.manual_review.players)) {
    return entry.manual_review;
  }

  return {
    status: entry.status || "published",
    resultLabel: entry.series?.resultLabel || "",
    winnerTeam: entry.series?.winnerTeam || "",
    team1SeriesScore: entry.series?.team1SeriesScore ?? null,
    team2SeriesScore: entry.series?.team2SeriesScore ?? null,
    needsReview: entry.needsReview ?? false,
    maps: (entry.maps || []).map(map => ({
      orderIndex: map.orderIndex,
      mode: map.mode || map.modeName || "",
      map: map.map || map.mapName || "",
      side: map.side || map.sideName || "",
      team1Score: map.team1Score ?? null,
      team2Score: map.team2Score ?? null,
    })),
    players: entry.players || [],
  };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedEntries(map, valueKey = "count", labelKey = "label") {
  return [...map.entries()]
    .map(([label, count]) => ({ [labelKey]: label, [valueKey]: count }))
    .sort((a, b) => b[valueKey] - a[valueKey] || String(a[labelKey]).localeCompare(String(b[labelKey])));
}

function toMonthKey(matchDate) {
  const match = String(matchDate || "").match(/^(\d{4}-\d{2})-/);
  return match ? match[1] : "unknown";
}

function buildPlayerStats(entries) {
  const players = new Map();

  for (const entry of entries) {
    const review = getEffectiveReview(entry);
    for (const player of review.players || []) {
      if (!player.playerName || !player.teamName) continue;

      const key = `${player.teamName}__${player.playerName}`;
      const current = players.get(key) || {
        teamName: player.teamName,
        playerName: player.playerName,
        mapsPlayed: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        points: 0,
        impact: 0,
        mvpCount: 0,
      };

      current.mapsPlayed += 1;
      current.kills += Number(player.kills || 0);
      current.deaths += Number(player.deaths || 0);
      current.assists += Number(player.assists || 0);
      current.points += Number(player.points || 0);
      current.impact += Number(player.impact || 0);
      current.mvpCount += player.isMvp ? 1 : 0;

      players.set(key, current);
    }
  }

  return [...players.values()]
    .map(player => ({
      ...player,
      kdRatio: player.deaths > 0 ? Number((player.kills / player.deaths).toFixed(2)) : null,
      avgPoints: player.mapsPlayed > 0 ? Number((player.points / player.mapsPlayed).toFixed(1)) : null,
      avgImpact: player.mapsPlayed > 0 ? Number((player.impact / player.mapsPlayed).toFixed(1)) : null,
    }))
    .sort((a, b) => b.kills - a.kills || b.points - a.points || a.playerName.localeCompare(b.playerName));
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`File non trovato: ${INPUT_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const published = matches.filter(entry => {
    const status = getEffectiveReview(entry).status || entry.status || "published";
    return status === "published";
  });

  const byOpponent = new Map();
  const byMonth = new Map();
  const byMode = new Map();
  const byMap = new Map();
  const bySide = new Map();

  let wins = 0;
  let losses = 0;
  let drafts = 0;
  let cancelled = 0;
  let mapsWithScore = 0;
  let mapWins = 0;
  let mapLosses = 0;

  for (const entry of matches) {
    const review = getEffectiveReview(entry);
    const status = review.status || entry.status || "published";

    if (status === "cancelled") {
      cancelled += 1;
      continue;
    }

    if (status === "draft") {
      drafts += 1;
      continue;
    }

    increment(byOpponent, entry.team2 || "unknown");
    increment(byMonth, toMonthKey(entry.matchDate));

    const resultLabel = String(review.resultLabel || "").toLowerCase();
    if (resultLabel.includes("vittoria")) wins += 1;
    else if (resultLabel.includes("sconfitta")) losses += 1;

    for (const map of review.maps || []) {
      if (!map.mode && !map.map && !map.side) continue;

      increment(byMode, map.mode || "unknown");
      increment(byMap, map.map || "unknown");
      increment(bySide, map.side || "unknown");

      if (map.team1Score !== null && map.team2Score !== null) {
        mapsWithScore += 1;
        if (map.team1Score > map.team2Score) mapWins += 1;
        else if (map.team1Score < map.team2Score) mapLosses += 1;
      }
    }
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    sourceFile: INPUT_PATH,
    totals: {
      matches: matches.length,
      published: published.length,
      drafts,
      cancelled,
      wins,
      losses,
      matchWinRate: published.length > 0 ? Number((wins / published.length * 100).toFixed(2)) : 0,
      mapsWithScore,
      mapWins,
      mapLosses,
      mapWinRate: mapsWithScore > 0 ? Number((mapWins / mapsWithScore * 100).toFixed(2)) : 0,
    },
    opponents: sortedEntries(byOpponent),
    months: sortedEntries(byMonth),
    modes: sortedEntries(byMode),
    maps: sortedEntries(byMap),
    sides: sortedEntries(bySide),
    players: buildPlayerStats(matches),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2), "utf8");

  console.log(`✅ Statistiche match create: ${OUTPUT_PATH}`);
  console.log(`ℹ️ Match analizzati: ${matches.length}`);
}

main();
