const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const NAME_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/";
const DIGIT_WHITELIST = "0123456789";
const KDA_WHITELIST = "0123456789/";
const TIME_WHITELIST = "0123456789:";
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;
const TESSERACT_SINGLE_LINE_PSM = "7";

function clampExtract(extract, width, height) {
  const left = Math.max(0, Math.min(width - 1, Math.round(extract.left)));
  const top = Math.max(0, Math.min(height - 1, Math.round(extract.top)));
  const safeWidth = Math.max(1, Math.min(width - left, Math.round(extract.width)));
  const safeHeight = Math.max(1, Math.min(height - top, Math.round(extract.height)));
  return { left, top, width: safeWidth, height: safeHeight };
}

function rowBaseTop(height, rowIndex, startFactor = 0.3455, stepFactor = 0.1028) {
  const start = height * startFactor;
  const step = height * stepFactor;
  return Math.round(start + step * rowIndex);
}

function buildTeamCropLayout(width, height, side, mode, preset = {}) {
  const isLeft = side === "left";
  const rowTops = [0, 1, 2, 3, 4].map(index =>
    rowBaseTop(
      height,
      index,
      preset.startFactor ?? 0.3455,
      preset.stepFactor ?? 0.1028
    )
  );

  const nameWidthScale = preset.nameWidthScale ?? 1;
  const pointsWidthScale = preset.pointsWidthScale ?? 1;
  const kdaWidthScale = preset.kdaWidthScale ?? 1;
  const timeWidthScale = preset.timeWidthScale ?? 1;
  const impactWidthScale = preset.impactWidthScale ?? 1;
  const rowTopOffset = preset.rowTopOffset ?? 0;
  const nameTopOffset = preset.nameTopOffset ?? 0.008;
  const rowHeightScale = preset.rowHeightScale ?? 1;
  const nameHeightScale = preset.nameHeightScale ?? rowHeightScale;
  const kdaHeightScale = preset.kdaHeightScale ?? rowHeightScale;
  const timeHeightScale = preset.timeHeightScale ?? rowHeightScale;
  const impactHeightScale = preset.impactHeightScale ?? rowHeightScale;
  const pointsLeftShift = preset.pointsLeftShift ?? 0;
  const nameLeftShift = preset.nameLeftShift ?? 0;
  const kdaLeftShift = preset.kdaLeftShift ?? 0;
  const timeLeftShift = preset.timeLeftShift ?? 0;
  const impactLeftShift = preset.impactLeftShift ?? 0;

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
        left: columns.name.left + width * nameLeftShift,
        top: top + height * (nameTopOffset + rowTopOffset),
        width: columns.name.width * nameWidthScale,
        height: height * 0.031 * nameHeightScale,
      },
      width,
      height
    ),
    points: clampExtract(
      {
        left: columns.points.left + width * pointsLeftShift,
        top: top + height * rowTopOffset,
        width: columns.points.width * pointsWidthScale,
        height: height * 0.058 * rowHeightScale,
      },
      width,
      height
    ),
    kda: clampExtract(
      {
        left: columns.kda.left + width * kdaLeftShift,
        top: top + height * (0.004 + rowTopOffset),
        width: columns.kda.width * kdaWidthScale,
        height: height * 0.045 * kdaHeightScale,
      },
      width,
      height
    ),
    time:
      String(mode || "").toLowerCase() === "hp"
        ? clampExtract(
            {
              left: columns.time.left + width * timeLeftShift,
              top: top + height * (0.004 + rowTopOffset),
              width: columns.time.width * timeWidthScale,
              height: height * 0.045 * timeHeightScale,
            },
            width,
            height
          )
        : null,
    impact: clampExtract(
      {
        left: columns.impact.left + width * impactLeftShift,
        top: top + height * (0.004 + rowTopOffset),
        width: columns.impact.width * impactWidthScale,
        height: height * 0.045 * impactHeightScale,
      },
      width,
      height
    ),
  }));
}

function buildTeamCropLayouts(width, height, side, mode) {
  const aspectRatio = width > 0 && height > 0 ? width / height : 0;
  const presets = [
    {
      name: "standard",
    },
    {
      name: "relaxed",
      rowTopOffset: -0.004,
      nameTopOffset: 0.004,
      rowHeightScale: 1.18,
      nameHeightScale: 1.22,
      kdaHeightScale: 1.15,
      timeHeightScale: 1.15,
      impactHeightScale: 1.18,
      nameWidthScale: side === "right" ? 1.2 : 1.12,
      pointsWidthScale: 1.1,
      kdaWidthScale: 1.08,
      timeWidthScale: 1.1,
      impactWidthScale: 1.12,
      nameLeftShift: side === "right" ? -0.008 : -0.004,
      pointsLeftShift: side === "right" ? -0.005 : -0.002,
      impactLeftShift: side === "right" ? -0.004 : 0,
    },
    {
      name: "lower",
      startFactor: 0.3495,
      stepFactor: 0.1028,
      rowTopOffset: 0.002,
      rowHeightScale: 1.12,
      nameWidthScale: side === "right" ? 1.15 : 1.08,
      pointsWidthScale: 1.06,
      impactWidthScale: 1.1,
      nameLeftShift: side === "right" ? -0.006 : 0,
    },
  ];

  if (aspectRatio >= 4) {
    presets.push({
      name: "ultrawide",
      startFactor: 0.332,
      stepFactor: 0.112,
      rowTopOffset: -0.003,
      rowHeightScale: 1.25,
      nameHeightScale: 1.32,
      nameWidthScale: side === "right" ? 1.32 : 1.22,
      pointsWidthScale: 1.16,
      kdaWidthScale: 1.14,
      timeWidthScale: 1.14,
      impactWidthScale: 1.16,
      nameLeftShift: side === "right" ? -0.01 : -0.006,
      pointsLeftShift: side === "right" ? -0.008 : -0.003,
      impactLeftShift: side === "right" ? -0.008 : 0,
    });
  }

  return presets.map(preset => ({
    name: preset.name,
    rows: buildTeamCropLayout(width, height, side, mode, preset),
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
      tessedit_pageseg_mode: TESSERACT_SINGLE_LINE_PSM,
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

function scoreExtractedRow(player) {
  if (!player) return -1;

  let score = 0;
  if (player.playerName) score += Math.max(2, Math.min(8, player.playerName.length));
  if (player.points !== null) score += 5;
  if (
    player.kills !== null &&
    player.deaths !== null &&
    player.assists !== null
  ) {
    score += 6;
  }
  if (player.timePlayed) score += 3;
  if (player.impact !== null) score += 3;

  return score;
}

async function downloadImageBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download screenshot fallito (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Download screenshot timeout (${IMAGE_DOWNLOAD_TIMEOUT_MS}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const leftLayouts = buildTeamCropLayouts(width, height, "left", mode);
  const rightLayouts = buildTeamCropLayouts(width, height, "right", mode);

  const players = [];

  async function extractRow(row, teamName, rowIndex) {
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
    };
  }

  async function extractBestRow(layouts, teamName, rowIndex) {
    if (!layouts.length) return null;

    const primaryLayout = layouts[0]?.rows?.[rowIndex];
    let best = primaryLayout ? await extractRow(primaryLayout, teamName, rowIndex) : null;
    let bestScore = scoreExtractedRow(best);

    if (bestScore >= 8) {
      return best;
    }

    for (let layoutIndex = 1; layoutIndex < layouts.length; layoutIndex += 1) {
      const row = layouts[layoutIndex]?.rows?.[rowIndex];
      if (!row) continue;

      const candidate = await extractRow(row, teamName, rowIndex);
      const candidateScore = scoreExtractedRow(candidate);

      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }

    return best;
  }

  for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
    const leftPlayer = await extractBestRow(leftLayouts, team1, rowIndex);
    const rightPlayer = await extractBestRow(rightLayouts, team2, rowIndex);

    if (leftPlayer) players.push(leftPlayer);
    if (rightPlayer) players.push(rightPlayer);
  }

  return players;
}

function normalizeNamesAcrossMatch(players) {
  const canonicalByTeamAndName = new Map();

  for (const player of players || []) {
    const raw = sanitizeNameCandidate(player.playerName);
    if (!raw) continue;
    const key = `${player.teamName}::${raw.toLowerCase()}`;
    canonicalByTeamAndName.set(key, raw);
  }

  for (const player of players || []) {
    const raw = sanitizeNameCandidate(player.playerName);
    if (!raw) continue;
    const key = `${player.teamName}::${raw.toLowerCase()}`;
    player.playerName = canonicalByTeamAndName.get(key) || raw;
  }

  return players;
}

async function extractPlayersFromStoredMatchData({ screenshots, maps, team1, team2 }) {
  const worker = await createWorker("eng");
  const players = [];

  try {
    for (let index = 0; index < (screenshots || []).length; index += 1) {
      const screenshot = screenshots[index];
      try {
        const buffer = await downloadImageBuffer(screenshot.url);
        const metadata = await sharp(buffer).metadata();
        const expectedMode = maps?.[index]?.mode || maps?.[index]?.mode_name || "";

        const extractedPlayers = await extractPlayersFromScreenshot({
          worker,
          buffer,
          metadata,
          orderIndex: index + 1,
          mode: expectedMode,
          team1,
          team2,
        });

        players.push(...extractedPlayers);
      } catch (error) {
        console.warn(
          `⚠️ Screenshot player extraction saltato [mappa ${index + 1}]: ${error.message}`
        );
      }
    }
  } finally {
    await worker.terminate();
  }

  normalizeNamesAcrossMatch(players);

  return players;
}

module.exports = {
  sanitizeNameCandidate,
  extractPlayersFromStoredMatchData,
};
