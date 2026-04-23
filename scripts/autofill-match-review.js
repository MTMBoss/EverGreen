require("dotenv").config();

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const { extractMatchDataFromImages } = require("../matches/matchImageParser");

const INPUT_PATH =
  process.argv[2] ||
  path.join(process.cwd(), "exports", "match-review-queue.json");

const slugArg = process.argv.find(arg => arg.startsWith("--slug="));
const targetSlug = slugArg ? String(slugArg.split("=")[1] || "").trim() : "";
const shouldApply = process.argv.includes("--apply");

const NAME_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/";
const DIGIT_WHITELIST = "0123456789";
const KDA_WHITELIST = "0123456789/";
const TIME_WHITELIST = "0123456789:";

function clampExtract(extract, width, height) {
  const left = Math.max(0, Math.min(width - 1, Math.round(extract.left)));
  const top = Math.max(0, Math.min(height - 1, Math.round(extract.top)));
  const safeWidth = Math.max(1, Math.min(width - left, Math.round(extract.width)));
  const safeHeight = Math.max(1, Math.min(height - top, Math.round(extract.height)));
  return { left, top, width: safeWidth, height: safeHeight };
}

function rowBaseTop(height, rowIndex) {
  const start = height * 0.3455;
  const step = height * 0.1028;
  return Math.round(start + step * rowIndex);
}

function buildTeamCropLayout(width, height, side, mode) {
  const isLeft = side === "left";
  const rowTops = [0, 1, 2, 3, 4].map(index => rowBaseTop(height, index));

  const columns = isLeft
    ? {
        name: { left: width * 0.095, width: width * 0.09 },
        points: { left: width * 0.223, width: width * 0.06 },
        kda: { left: width * 0.298, width: width * 0.065 },
        time: { left: width * 0.365, width: width * 0.05 },
        impact: { left: width * 0.42, width: width * 0.042 },
      }
    : {
        name: { left: width * 0.573, width: width * 0.102 },
        points: { left: width * 0.701, width: width * 0.064 },
        kda: { left: width * 0.774, width: width * 0.067 },
        time: { left: width * 0.848, width: width * 0.05 },
        impact: { left: width * 0.908, width: width * 0.042 },
      };

  return rowTops.map(top => ({
    name: clampExtract(
      {
        left: columns.name.left,
        top: top + height * 0.008,
        width: columns.name.width,
        height: height * 0.031,
      },
      width,
      height
    ),
    points: clampExtract(
      {
        left: columns.points.left,
        top,
        width: columns.points.width,
        height: height * 0.058,
      },
      width,
      height
    ),
    kda: clampExtract(
      {
        left: columns.kda.left,
        top: top + height * 0.004,
        width: columns.kda.width,
        height: height * 0.045,
      },
      width,
      height
    ),
    time:
      String(mode || "").toLowerCase() === "hp"
        ? clampExtract(
            {
              left: columns.time.left,
              top: top + height * 0.004,
              width: columns.time.width,
              height: height * 0.045,
            },
            width,
            height
          )
        : null,
    impact: clampExtract(
      {
        left: columns.impact.left,
        top: top + height * 0.004,
        width: columns.impact.width,
        height: height * 0.045,
      },
      width,
      height
    ),
  }));
}

async function buildCropVariants(buffer, extract) {
  const variants = [
    { name: "original", scale: 4 },
    { name: "graynorm", scale: 4, grayscale: true, normalize: true },
    { name: "thr150", scale: 4, grayscale: true, normalize: true, threshold: 150 },
    { name: "thr175", scale: 4, grayscale: true, normalize: true, threshold: 175 },
  ];

  const results = [];

  for (const variant of variants) {
    let pipeline = sharp(buffer).extract(extract).resize(
      Math.max(1, Math.round(extract.width * variant.scale)),
      Math.max(1, Math.round(extract.height * variant.scale)),
      { fit: "fill" }
    );

    if (variant.grayscale) pipeline = pipeline.grayscale();
    if (variant.normalize) pipeline = pipeline.normalize();
    if (variant.threshold) pipeline = pipeline.threshold(variant.threshold);

    results.push({
      name: variant.name,
      buffer: await pipeline.png().toBuffer(),
    });
  }

  return results;
}

async function ocrCandidates(worker, buffer, extract, whitelist) {
  const variants = await buildCropVariants(buffer, extract);
  const candidates = [];

  for (const variant of variants) {
    await worker.setParameters({
      tessedit_char_whitelist: whitelist || "",
    });

    const result = await worker.recognize(variant.buffer);
    const text = String(result.data?.text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      candidates.push(text);
    }
  }

  return candidates;
}

function sanitizeNameCandidate(value) {
  let text = String(value || "")
    .replace(/\s+/g, "")
    .replace(/^[^A-Za-z0-9/]+/, "")
    .replace(/[^A-Za-z0-9/]+$/, "");

  text = text
    .replace(/^4Els/i, "ETs")
    .replace(/^Els/i, "ETs")
    .replace(/^JETs/i, "ETs")
    .replace(/^TETs/i, "ETs")
    .replace(/^LiETs/i, "ETs")
    .replace(/^vETs/i, "ETs")
    .replace(/^t400Lux/i, "400Lux")
    .replace(/^400LuxS$/i, "400Lux")
    .replace(/^Monstdrea?$/i, "Monst3re")
    .replace(/^Monst3rea?$/i, "Monst3re")
    .replace(/^Monstdre/i, "Monst3re")
    .replace(/^t?SThragg$/i, "ŠThrägg")
    .replace(/^MBrag$/i, "MDrag")
    .replace(/^Mtrag$/i, "MDrag")
    .replace(/^t?MbragS?$/i, "MDrag")
    .replace(/^ETsLUCIFER\d+$/i, "ETsLUCIFER")
    .replace(/^ALUlaFawkes.*$/i, "ALUlaFawkes")
    .replace(/^AlUlaFawkes.*$/i, "ALUlaFawkes")
    .replace(/^ETsNightfallYT.*$/i, "ETsNightfallYT")
    .replace(/^ETsWukong.*$/i, "ETsWukong");

  text = text
    .replace(/([A-Z]{2,}.*?)[a-z]{1,3}$/u, "$1")
    .replace(/([A-Za-z/]{3,}.*?)[A-Z]?\d{1,3}$/u, "$1");

  if (/^Age.*$/i.test(text) || /^Aqe.*$/i.test(text) || /^Aqd.*$/i.test(text) || /^Ard$/i.test(text)) {
    return "A¢€";
  }

  return text;
}

function scoreNameCandidate(value) {
  const text = sanitizeNameCandidate(value);
  if (!text) return { text: "", score: -1 };

  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  const slashes = (text.match(/\//g) || []).length;
  const score =
    letters * 4 +
    digits * 2 +
    slashes * 2 -
    Math.abs(text.length - 8);

  return { text, score };
}

function pickBestName(candidates) {
  let best = { text: "", score: -1 };
  for (const candidate of candidates || []) {
    const scored = scoreNameCandidate(candidate);
    if (scored.score > best.score) {
      best = scored;
    }
  }
  return best.text;
}

function extractDigitCandidates(candidates, minLength = 1, maxLength = 4) {
  const values = [];

  for (const candidate of candidates || []) {
    const matches = String(candidate).match(/\d+/g) || [];
    for (const match of matches) {
      if (match.length >= minLength && match.length <= maxLength) {
        values.push(Number(match));
      }
    }
  }

  return values.filter(Number.isFinite);
}

function pickBestPoints(candidates) {
  const values = extractDigitCandidates(candidates, 3, 4);
  if (!values.length) return null;
  return Math.max(...values);
}

function pickBestImpact(candidates) {
  const values = extractDigitCandidates(candidates, 1, 3);
  if (!values.length) return null;

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0]?.[0] ?? null;
}

function parseKdaCandidate(candidate) {
  const match = String(candidate).match(/(\d{1,2})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return {
    kills: Number(match[1]),
    deaths: Number(match[2]),
    assists: Number(match[3]),
  };
}

function chooseComponent(values, kind) {
  const max = kind === "assists" ? 30 : 60;
  const direct = values.filter(value => value >= 0 && value <= max);
  const pool = direct.length ? direct : values;
  if (!pool.length) return null;

  const counts = new Map();
  for (const value of pool) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0]?.[0] ?? null;
}

function pickBestKda(candidates) {
  const parsed = (candidates || [])
    .map(parseKdaCandidate)
    .filter(Boolean);

  if (!parsed.length) return null;

  return {
    kills: chooseComponent(parsed.map(item => item.kills), "kills"),
    deaths: chooseComponent(parsed.map(item => item.deaths), "deaths"),
    assists: chooseComponent(parsed.map(item => item.assists), "assists"),
  };
}

function pickBestTime(candidates) {
  const normalized = (candidates || [])
    .map(candidate => {
      const match = String(candidate).match(/(\d{1,2})[:](\d{2})/);
      if (!match) return null;
      return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    })
    .filter(Boolean);

  if (!normalized.length) return "";

  const counts = new Map();
  for (const value of normalized) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function levenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function similarity(a, b) {
  const left = sanitizeNameCandidate(a);
  const right = sanitizeNameCandidate(b);
  if (!left || !right) return 0;
  const distance = levenshtein(left.toLowerCase(), right.toLowerCase());
  return 1 - distance / Math.max(left.length, right.length, 1);
}

function chooseCanonicalName(names) {
  const cleaned = names.map(sanitizeNameCandidate).filter(Boolean);
  if (!cleaned.length) return "";

  let best = "";
  let bestScore = -1;

  for (const candidate of cleaned) {
    let score = scoreNameCandidate(candidate).score;
    for (const other of cleaned) {
      score += similarity(candidate, other) * 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function normalizeNamesAcrossMatch(players) {
  const byTeam = new Map();

  for (const player of players) {
    const list = byTeam.get(player.teamName) || [];
    list.push(player);
    byTeam.set(player.teamName, list);
  }

  for (const teamPlayers of byTeam.values()) {
    const clusters = [];

    for (const player of teamPlayers) {
      const rawName = player.playerName;
      let targetCluster = null;

      for (const cluster of clusters) {
        if (cluster.names.some(name => similarity(name, rawName) >= 0.6)) {
          targetCluster = cluster;
          break;
        }
      }

      if (!targetCluster) {
        targetCluster = { names: [] };
        clusters.push(targetCluster);
      }

      targetCluster.names.push(rawName);
    }

    for (const cluster of clusters) {
      const canonical = chooseCanonicalName(cluster.names);
      for (const player of teamPlayers) {
        if (cluster.names.includes(player.playerName)) {
          player.playerName = canonical || player.playerName;
        }
      }
    }
  }

  return players;
}

async function downloadImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download screenshot fallito (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function extractPlayersFromScreenshot({
  worker,
  buffer,
  metadata,
  orderIndex,
  mode,
  team1,
  team2,
}) {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const leftRows = buildTeamCropLayout(width, height, "left", mode);
  const rightRows = buildTeamCropLayout(width, height, "right", mode);

  const players = [];

  async function extractRow(row, side, teamName, rowIndex) {
    const nameCandidates = await ocrCandidates(worker, buffer, row.name, NAME_WHITELIST);
    const pointsCandidates = await ocrCandidates(worker, buffer, row.points, DIGIT_WHITELIST);
    const kdaCandidates = await ocrCandidates(worker, buffer, row.kda, KDA_WHITELIST);
    const timeCandidates = row.time
      ? await ocrCandidates(worker, buffer, row.time, TIME_WHITELIST)
      : [];
    const impactCandidates = await ocrCandidates(worker, buffer, row.impact, DIGIT_WHITELIST);

    const bestKda = pickBestKda(kdaCandidates);
    const playerName = pickBestName(nameCandidates);
    const points = pickBestPoints(pointsCandidates);
    const impact = pickBestImpact(impactCandidates);
    const timePlayed = row.time ? pickBestTime(timeCandidates) : "";

    if (!playerName && !bestKda && points === null && impact === null) {
      return null;
    }

    return {
      orderIndex,
      teamName,
      playerName,
      kills: bestKda?.kills ?? null,
      deaths: bestKda?.deaths ?? null,
      assists: bestKda?.assists ?? null,
      points,
      timePlayed,
      impact,
      isMvp: rowIndex === 0,
      side,
    };
  }

  for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
    const leftPlayer = await extractRow(leftRows[rowIndex], "left", team1, rowIndex);
    const rightPlayer = await extractRow(rightRows[rowIndex], "right", team2, rowIndex);

    if (leftPlayer) players.push(leftPlayer);
    if (rightPlayer) players.push(rightPlayer);
  }

  return players;
}

async function autofillMatch(entry) {
  const screenshots = Array.isArray(entry.screenshots) ? entry.screenshots : [];
  if (!screenshots.length) {
    return {
      ...entry.manual_review,
      apply: true,
      needsReview: false,
    };
  }

  const expectedMaps = (entry.maps || []).map(map => ({
    orderIndex: map.orderIndex,
    mode: map.mode || map.modeName || "",
    map: map.mapName || map.map || "",
    side: map.sideName || map.side || "",
  }));

  const extraction = await extractMatchDataFromImages(
    screenshots,
    expectedMaps,
    { team1: entry.team1, team2: entry.team2 }
  );

  const worker = await createWorker("eng");
  const players = [];

  try {
    for (let index = 0; index < screenshots.length; index += 1) {
      const screenshot = screenshots[index];
      const buffer = await downloadImageBuffer(screenshot.url);
      const metadata = await sharp(buffer).metadata();
      const expectedMode = expectedMaps[index]?.mode || "";

      const extractedPlayers = await extractPlayersFromScreenshot({
        worker,
        buffer,
        metadata,
        orderIndex: index + 1,
        mode: expectedMode,
        team1: entry.team1,
        team2: entry.team2,
      });

      players.push(...extractedPlayers);
    }
  } finally {
    await worker.terminate();
  }

  normalizeNamesAcrossMatch(players);

  const mapsByOrder = new Map(
    (expectedMaps || []).map(map => [
      map.orderIndex,
      {
        orderIndex: map.orderIndex,
        mode: map.mode || "",
        map: map.map || "",
        side: map.side || "",
        team1Score: null,
        team2Score: null,
      },
    ])
  );

  for (const extractedMap of extraction.maps || []) {
    mapsByOrder.set(extractedMap.orderIndex, {
      orderIndex: extractedMap.orderIndex,
      mode: extractedMap.mode || mapsByOrder.get(extractedMap.orderIndex)?.mode || "",
      map: extractedMap.map || mapsByOrder.get(extractedMap.orderIndex)?.map || "",
      side: extractedMap.side || mapsByOrder.get(extractedMap.orderIndex)?.side || "",
      team1Score: extractedMap.team1Score ?? null,
      team2Score: extractedMap.team2Score ?? null,
    });
  }

  return {
    apply: shouldApply,
    status: "published",
    resultLabel: entry.series?.resultLabel || "",
    winnerTeam: entry.series?.winnerTeam || "",
    team1SeriesScore: entry.series?.team1SeriesScore ?? null,
    team2SeriesScore: entry.series?.team2SeriesScore ?? null,
    needsReview: true,
    maps: [...mapsByOrder.values()].sort((a, b) => a.orderIndex - b.orderIndex),
    players: players.map(player => ({
      orderIndex: player.orderIndex,
      teamName: player.teamName,
      playerName: player.playerName,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      points: player.points,
      timePlayed: player.timePlayed || "",
      impact: player.impact,
      isMvp: Boolean(player.isMvp),
    })),
  };
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`File non trovato: ${INPUT_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  let processed = 0;

  for (const entry of matches) {
    if (targetSlug && entry.slug !== targetSlug) {
      continue;
    }

    entry.manual_review = await autofillMatch(entry);
    processed += 1;
    console.log(`✅ Autofill completato: ${entry.slug}`);
  }

  fs.writeFileSync(INPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`ℹ️ Autofill review completato. Match processati: ${processed}`);
}

main().catch(error => {
  console.error("❌ Errore autofill match review:", error);
  process.exit(1);
});
