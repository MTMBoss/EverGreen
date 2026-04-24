const fs = require("fs");
const path = require("path");

const { extractPlayersFromStoredMatchData } = require("../matches/manualPlayerExtraction");

const INPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "site-match-review-queue.json");
const OUTPUT_PATH =
  process.argv[3] ||
  path.join(process.cwd(), "exports", "match-player-stats.json");

const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
const slugArg = process.argv.find(arg => arg.startsWith("--slug="));
const resumeArg = process.argv.includes("--resume");
const retryEmptyArg = process.argv.includes("--retry-empty");
const retryIncompleteArg = process.argv.includes("--retry-incomplete");
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0)) : 0;
const targetSlug = slugArg ? String(slugArg.split("=")[1] || "").trim() : "";

function getInputPayload() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`File non trovato: ${INPUT_PATH}`);
  }
  return JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
}

function buildMapInfoByOrder(entry) {
  return new Map(
    (entry.maps || []).map(map => [
      Number(map.orderIndex || 0),
      {
        orderIndex: Number(map.orderIndex || 0),
        mode: String(map.mode || map.modeName || ""),
        mapName: String(map.mapName || map.map || ""),
        sideName: String(map.sideName || map.side || ""),
        team1Score: map.team1Score ?? null,
        team2Score: map.team2Score ?? null,
      },
    ])
  );
}

function presentPlayer(player) {
  return {
    playerName: player.playerName || "",
    points: player.points ?? null,
    kda: {
      kills: player.kills ?? null,
      deaths: player.deaths ?? null,
      assists: player.assists ?? null,
    },
    kdaLabel:
      player.kills !== null && player.deaths !== null && player.assists !== null
        ? `${player.kills} / ${player.deaths} / ${player.assists}`
        : "",
    timePlayed: player.timePlayed || "",
    impact: player.impact ?? null,
    isMvp: Boolean(player.isMvp),
  };
}

function groupPlayersByMapAndTeam(entry, players) {
  const mapsByOrder = buildMapInfoByOrder(entry);
  const grouped = new Map();

  for (const player of players || []) {
    const key = Number(player.orderIndex || 0);
    if (!grouped.has(key)) {
      grouped.set(key, {
        map: mapsByOrder.get(key) || {
          orderIndex: key,
          mode: "",
          mapName: "",
          sideName: "",
          team1Score: null,
          team2Score: null,
        },
        teams: {
          [entry.team1]: [],
          [entry.team2]: [],
        },
      });
    }

    const current = grouped.get(key);
    if (!current.teams[player.teamName]) {
      current.teams[player.teamName] = [];
    }

    current.teams[player.teamName].push(presentPlayer(player));
  }

  return [...grouped.values()]
    .sort((a, b) => a.map.orderIndex - b.map.orderIndex)
    .map(item => ({
      ...item,
      teams: Object.fromEntries(
        Object.entries(item.teams).map(([teamName, teamPlayers]) => [
          teamName,
          [...teamPlayers].sort((a, b) => {
            const left = Number.isFinite(b.points) ? b.points : -1;
            const right = Number.isFinite(a.points) ? a.points : -1;
            return left - right;
          }),
        ])
      ),
    }));
}

function buildTextReport(match) {
  const lines = [];
  lines.push(`${match.title}`);
  lines.push(`${match.seriesLabel}`);
  lines.push("");

  for (const mapBlock of match.maps) {
    lines.push(`Mappa ${mapBlock.map.orderIndex}: ${mapBlock.map.mode} | ${mapBlock.map.mapName} | ${mapBlock.map.sideName}`);
    if (mapBlock.map.team1Score !== null || mapBlock.map.team2Score !== null) {
      lines.push(`Score: ${mapBlock.map.team1Score ?? "-"} - ${mapBlock.map.team2Score ?? "-"}`);
    }

    for (const [teamName, players] of Object.entries(mapBlock.teams)) {
      if (!players.length) continue;
      lines.push(`${teamName}:`);

      players.forEach((player, index) => {
        lines.push(`${index + 1}. ${player.playerName || "-"}`);
        lines.push(`   - Punteggio: ${player.points ?? "-"}`);
        lines.push(`   - U/M/A: ${player.kdaLabel || "-"}`);
        lines.push(`   - Tempo: ${player.timePlayed || "-"}`);
        lines.push(`   - Impatto: ${player.impact ?? "-"}`);
        lines.push(`   - MVP: ${player.isMvp ? "sì" : "no"}`);
      });
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

function getExistingOutput() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  } catch (error) {
    console.warn(`⚠️ Output esistente ignorato (${OUTPUT_PATH}): ${error.message}`);
    return null;
  }
}

function writeOutput(results, orderedSlugs = []) {
  const sortedResults =
    orderedSlugs.length > 0
      ? [...results].sort((left, right) => {
          const leftIndex = orderedSlugs.indexOf(left.slug);
          const rightIndex = orderedSlugs.indexOf(right.slug);
          return leftIndex - rightIndex;
        })
      : results;

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: INPUT_PATH,
    totalMatches: sortedResults.length,
    matches: sortedResults,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
}

async function processEntry(entry, index, total) {
  console.log(`ℹ️ Estrazione player bulk [${index + 1}/${total}]: ${entry.slug}`);

  const screenshots = Array.isArray(entry.screenshots) ? entry.screenshots : [];
  if (!screenshots.length) {
    return {
      slug: entry.slug,
      title: `${entry.team1} vs ${entry.team2}`,
      seriesLabel: `${entry.series?.resultLabel || ""} ${entry.series?.team1SeriesScore ?? "-"}-${entry.series?.team2SeriesScore ?? "-"}`.trim(),
      extractedPlayers: 0,
      maps: [],
      textReport: "",
      skipped: "no_screenshots",
    };
  }

  const players = await extractPlayersFromStoredMatchData({
    screenshots,
    maps: entry.maps || [],
    team1: entry.team1,
    team2: entry.team2,
  });

  const maps = groupPlayersByMapAndTeam(entry, players);
  const match = {
    slug: entry.slug,
    title: `${entry.team1} vs ${entry.team2}`,
    seriesLabel: `${entry.series?.resultLabel || ""} ${entry.series?.team1SeriesScore ?? "-"}-${entry.series?.team2SeriesScore ?? "-"}`.trim(),
    extractedPlayers: players.length,
    maps,
  };

  return {
    ...match,
    textReport: buildTextReport(match),
  };
}

async function main() {
  const payload = getInputPayload();
  let matches = Array.isArray(payload.matches) ? payload.matches : [];
  const existingOutput = resumeArg ? getExistingOutput() : null;
  const existingMatches = Array.isArray(existingOutput?.matches) ? existingOutput.matches : [];
  const existingBySlug = new Map(existingMatches.map(match => [match.slug, match]));

  if (targetSlug) {
    matches = matches.filter(match => match.slug === targetSlug);
  }

  if (limit > 0) {
    matches = matches.slice(0, limit);
  }

  const orderedSlugs = matches.map(match => match.slug);

  const results = [];
  const pendingMatches = [];

  for (const match of matches) {
    const existing = existingBySlug.get(match.slug);
    const shouldRetryExisting = retryEmptyArg && Number(existing?.extractedPlayers || 0) <= 0;
    const expectedPlayers = (Array.isArray(match.screenshots) ? match.screenshots.length : 0) * 10;
    const shouldRetryIncomplete =
      retryIncompleteArg &&
      expectedPlayers > 0 &&
      Number(existing?.extractedPlayers || 0) > 0 &&
      Number(existing?.extractedPlayers || 0) < expectedPlayers;

    if (existing && !shouldRetryExisting && !shouldRetryIncomplete) {
      results.push(existing);
      continue;
    }
    pendingMatches.push(match);
  }

  if (resumeArg) {
    console.log(`ℹ️ Ripresa attiva: ${results.length} match già presenti, ${pendingMatches.length} da elaborare`);
  }

  if (retryEmptyArg) {
    console.log(`ℹ️ Retry match vuoti attivo: ${pendingMatches.length} match selezionati per nuova estrazione`);
  }

  if (retryIncompleteArg) {
    console.log(`ℹ️ Retry match incompleti attivo: ${pendingMatches.length} match selezionati per nuova estrazione`);
  }

  for (let index = 0; index < pendingMatches.length; index += 1) {
    const result = await processEntry(pendingMatches[index], index, pendingMatches.length);
    results.push(result);
    writeOutput(results, orderedSlugs);
    console.log(`✅ Salvataggio progressivo completato: ${result.slug} (${result.extractedPlayers || 0} player)`);
  }

  writeOutput(results, orderedSlugs);

  console.log(`✅ Export player stats creato: ${OUTPUT_PATH}`);
  console.log(`ℹ️ Match processati: ${results.length}`);
}

main().catch(error => {
  console.error("❌ Errore extract all match player stats:", error);
  process.exit(1);
});
