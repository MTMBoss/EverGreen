const fs = require("fs");
const path = require("path");

const INPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "site-match-snapshot.json");
const OUTPUT_PATH =
  process.argv[3] ||
  path.join(process.cwd(), "exports", "site-match-review-queue.json");

function normalizeStatus(label) {
  const value = String(label || "").trim().toLowerCase();
  if (value.includes("cancell")) return "cancelled";
  if (value.includes("bozza")) return "draft";
  return "published";
}

function parseTeams(title) {
  const text = String(title || "").trim();
  const match = text.match(/^(.*?)\s+vs\s+(.*?)$/i);
  if (!match) {
    return { team1: text, team2: "" };
  }

  return {
    team1: String(match[1] || "").trim(),
    team2: String(match[2] || "").trim(),
  };
}

function parseSeries(detail, fallbackResultLabel) {
  const resultLabel =
    detail?.summary?.series?.sub ||
    (String(fallbackResultLabel || "").includes("Vittoria")
      ? "Vittoria"
      : String(fallbackResultLabel || "").includes("Sconfitta")
        ? "Sconfitta"
        : "");
  const scoreLabel = detail?.summary?.series?.value || "";
  const scoreMatch = String(scoreLabel).match(/(\d+)\s*-\s*(\d+)/);
  const winnerTeam = detail?.summary?.winner?.value || "";

  return {
    resultLabel,
    winnerTeam,
    team1SeriesScore: scoreMatch ? Number(scoreMatch[1]) : null,
    team2SeriesScore: scoreMatch ? Number(scoreMatch[2]) : null,
  };
}

function buildManualReview(entry) {
  return {
    apply: false,
    status: entry.status,
    resultLabel: entry.series.resultLabel || "",
    winnerTeam: entry.series.winnerTeam || "",
    team1SeriesScore: entry.series.team1SeriesScore ?? null,
    team2SeriesScore: entry.series.team2SeriesScore ?? null,
    needsReview: false,
    maps: (entry.maps || []).map(map => ({
      orderIndex: map.orderIndex,
      mode: map.mode || "",
      map: map.mapName || "",
      side: map.sideName || "",
      team1Score: map.team1Score ?? null,
      team2Score: map.team2Score ?? null,
    })),
    players: (entry.players || []).map(player => ({
      orderIndex: player.orderIndex ?? null,
      teamName: player.teamName || "",
      playerName: player.playerName || "",
      kills: player.kills ?? null,
      deaths: player.deaths ?? null,
      assists: player.assists ?? null,
      points: player.points ?? null,
      timePlayed: player.timePlayed || "",
      impact: player.impact ?? null,
      isMvp: Boolean(player.isMvp || /mvp/i.test(player.mvpLabel || "")),
    })),
  };
}

function mapPlayers(players) {
  return (players || []).map(player => ({
    orderIndex: player.mapOrderIndex ?? player.orderIndex ?? null,
    teamName: player.teamName || "",
    playerName: player.playerName || "",
    kills: player.kills ?? null,
    deaths: player.deaths ?? null,
    assists: player.assists ?? null,
    points: player.points ?? null,
    timePlayed: player.timePlayed || "",
    impact: player.impact ?? null,
    isMvp: Boolean(player.isMvp || /mvp/i.test(player.mvpLabel || "")),
  }));
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`File non trovato: ${INPUT_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const matches = Array.isArray(raw.matches) ? raw.matches : [];

  const reviewMatches = matches.map(match => {
    const teams = parseTeams(match.title);
    const detail = match.detail || {};
    const series = parseSeries(detail, match.resultLabel);
    const matchDate = String(match.slug || "").match(/(\d{4}-\d{2}-\d{2})$/)?.[1] || "";
    const matchTime =
      detail?.summary?.date?.sub ||
      String(match.dateLabel || "").match(/(\d{2}:\d{2})$/)?.[1] ||
      "";

    const entry = {
      slug: match.slug,
      baseSlug: match.slug,
      team1: teams.team1,
      team2: teams.team2,
      matchDate,
      matchTime,
      status: normalizeStatus(match.statusLabel),
      needsReview: false,
      series,
      maps: (detail.maps || []).map(map => ({
        orderIndex: map.orderIndex,
        mode: map.mode || "",
        mapName: map.mapName || "",
        sideName: map.sideName || "",
        team1Score: map.team1Score ?? null,
        team2Score: map.team2Score ?? null,
      })),
      players: mapPlayers(detail.players || []),
      screenshots: (detail.screenshots || []).map(asset => ({
        sortOrder: asset.sortOrder || 0,
        url: asset.url || asset.imageUrl || "",
        sourceMessageId: "",
      })),
      analysisVersion: 0,
      lastAnalyzedAt: "",
      analysisDebug: detail.debug || null,
      source: {
        part1: {
          guildId: "",
          channelId: "",
          messageId: "",
          createdAt: "",
          messageUrl: "",
          rawText: "",
          parsed: null,
        },
        part2: {
          guildId: "",
          channelId: "",
          messageId: "",
          createdAt: "",
          messageUrl: "",
          rawText: "",
          parsed: null,
        },
      },
      notes: `Creato da snapshot sito: ${match.detailUrl || raw.source?.listUrl || ""}`,
    };

    entry.manual_review = buildManualReview(entry);
    return entry;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    exportSource: "site_snapshot",
    totalMatches: reviewMatches.length,
    instructions: [
      "File generato dallo snapshot del sito.",
      "Puoi usare scripts/autofill-match-review.js per tentare l'estrazione da screenshot.",
      "Imposta manual_review.apply a true solo per i match che vuoi importare nel DB.",
      "Per importare usa: node scripts/import-match-review.js exports/site-match-review-queue.json",
    ],
    matches: reviewMatches,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log(`✅ Review queue creata: ${OUTPUT_PATH}`);
  console.log(`ℹ️ Match convertiti: ${reviewMatches.length}`);
}

main();
