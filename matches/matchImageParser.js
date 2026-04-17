const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function extractMatchDataFromImages(attachments, expectedMaps = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return {
      maps: [],
      players: [],
      needsReview: true,
      extractionSummary: "Nessuno screenshot trovato nella Parte 2.",
    };
  }

  const worker = await createWorker("eng");
  const maps = [];
  const debug = [];

  try {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const expectedMap = expectedMaps[index] || null;
      const expectedMode = normalizeMode(expectedMap?.mode || "");
      const sourceBuffer = await downloadImageBuffer(attachment.url);

      const metadata = await sharp(sourceBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      const scoreZones = buildScoreZones(width, height);

      let bestScore = null;
      let bestWeight = -1;
      let bestSource = "none";

      for (const zone of scoreZones) {
        const zoneVariants = await buildZoneVariants(sourceBuffer, zone);

        for (const variant of zoneVariants) {
          const result = await worker.recognize(variant.buffer);
          const text = normalizeOcrText(result.data?.text || "");
          const confidence = Number(result.data?.confidence || 0);

          let score = extractScoreNearOutcome(text, expectedMode);

          if (!score) {
            score = extractBestScoreFromText(text, expectedMode);
          }

          debug.push({
            image: index + 1,
            expectedMode,
            zone: zone.name,
            variant: variant.name,
            confidence,
            textPreview: text.slice(0, 300),
            score,
          });

          if (score) {
            const weight = zone.baseWeight + confidence + score.weight;
            if (weight > bestWeight) {
              bestWeight = weight;
              bestScore = score;
              bestSource = `${zone.name}:${variant.name}`;
            }
          }
        }
      }

      if (bestScore) {
        maps.push({
          orderIndex: index + 1,
          team1Score: bestScore.team1Score,
          team2Score: bestScore.team2Score,
          mode: "",
          map: "",
          side: "",
        });
      }

      debug.push({
        image: index + 1,
        expectedMode,
        selectedSource: bestSource,
        selectedScore: bestScore,
      });
    }
  } finally {
    await worker.terminate();
  }

  return {
    maps: dedupeMapsByOrder(maps),
    players: [],
    needsReview: true,
    extractionSummary: buildSummary(maps, attachments.length),
    debug,
  };
}

async function downloadImageBuffer(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download screenshot fallito (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildScoreZones(width, height) {
  if (!width || !height) return [];

  return [
    {
      name: "header_left_tight",
      left: Math.floor(width * 0.00),
      top: Math.floor(height * 0.00),
      width: Math.floor(width * 0.38),
      height: Math.floor(height * 0.14),
      baseWeight: 80,
    },
    {
      name: "header_left_medium",
      left: Math.floor(width * 0.00),
      top: Math.floor(height * 0.00),
      width: Math.floor(width * 0.45),
      height: Math.floor(height * 0.18),
      baseWeight: 60,
    },
    {
      name: "header_top_full",
      left: 0,
      top: 0,
      width,
      height: Math.floor(height * 0.20),
      baseWeight: 35,
    },
  ];
}

async function buildZoneVariants(buffer, zone) {
  const cropped = sharp(buffer)
    .rotate()
    .extract({
      left: Math.max(0, zone.left),
      top: Math.max(0, zone.top),
      width: Math.max(1, zone.width),
      height: Math.max(1, zone.height),
    })
    .resize({ width: 1700, withoutEnlargement: false });

  const grayscale = await cropped
    .clone()
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const thresholdA = await cropped
    .clone()
    .grayscale()
    .normalize()
    .linear(1.18, -8)
    .threshold(180)
    .sharpen()
    .png()
    .toBuffer();

  const thresholdB = await cropped
    .clone()
    .grayscale()
    .normalize()
    .linear(1.30, -18)
    .threshold(200)
    .sharpen()
    .png()
    .toBuffer();

  const inverted = await cropped
    .clone()
    .grayscale()
    .normalize()
    .negate()
    .threshold(175)
    .sharpen()
    .png()
    .toBuffer();

  return [
    { name: "grayscale", buffer: grayscale },
    { name: "thresholdA", buffer: thresholdA },
    { name: "thresholdB", buffer: thresholdB },
    { name: "inverted", buffer: inverted },
  ];
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[|]/g, "1")
    .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0")
    .replace(/[Ss](?=\d)|(?<=\d)[Ss]/g, "5")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function extractScoreNearOutcome(text, expectedMode) {
  const compact = text
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/O/g, "0");

  const outcomePatterns = [
    /SCONFITTA(\d{1,3})[:\-](\d{1,3})/,
    /VITTORIA(\d{1,3})[:\-](\d{1,3})/,
    /DEFEAT(\d{1,3})[:\-](\d{1,3})/,
    /VICTORY(\d{1,3})[:\-](\d{1,3})/,
    /SCONFITTA(\d{1,3})(\d{1,3})/,
    /VITTORIA(\d{1,3})(\d{1,3})/,
  ];

  for (const pattern of outcomePatterns) {
    const match = compact.match(pattern);
    if (!match) continue;

    const left = Number(match[1]);
    const right = Number(match[2]);

    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    if (!isPlausibleScore(left, right, expectedMode)) continue;

    return {
      team1Score: left,
      team2Score: right,
      weight: 120 + modeBonus(left, right, expectedMode),
    };
  }

  return null;
}

function extractBestScoreFromText(text, expectedMode) {
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const candidates = [];

  for (const line of lines) {
    for (const score of extractScoresFromLine(line, expectedMode)) {
      candidates.push({
        ...score,
        line,
        weight: scoreWeight(score.team1Score, score.team2Score, line, expectedMode),
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0];
}

function extractScoresFromLine(line, expectedMode) {
  const results = [];
  const patterns = [
    /(\d{1,3})\s*[:\-]\s*(\d{1,3})/g,
    /(\d{1,3})\s+(\d{1,3})/g,
  ];

  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      const left = Number(match[1]);
      const right = Number(match[2]);

      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      if (!isPlausibleScore(left, right, expectedMode)) continue;

      results.push({
        team1Score: left,
        team2Score: right,
      });
    }
  }

  return results;
}

function isPlausibleScore(a, b, expectedMode) {
  if (a < 0 || b < 0) return false;
  if (a > 300 || b > 300) return false;

  if (expectedMode === "hp") {
    if (a > 250 || b > 250) return false;
    return a === 250 || b === 250;
  }

  if (expectedMode === "ced") {
    if (a > 9 || b > 9) return false;
    if (a === 0 && b === 0) return false;
    return a === 9 || b === 9;
  }

  if (expectedMode === "ctl") {
    if (a > 3 || b > 3) return false;
    if (a === 0 && b === 0) return false;
    return a === 3 || b === 3;
  }

  return true;
}

function scoreWeight(a, b, line, expectedMode) {
  let score = 0;

  if (/[:\-]/.test(line)) score += 20;
  if (/sconfitta|vittoria|defeat|victory/i.test(line)) score += 30;
  if (line.length <= 24) score += 8;
  if (line.length > 50) score -= 8;

  const digits = (line.match(/\d/g) || []).length;
  if (digits > 8) score -= 10;

  score += modeBonus(a, b, expectedMode);

  return score;
}

function modeBonus(a, b, expectedMode) {
  if (expectedMode === "hp") {
    if (a === 250 || b === 250) return 45;
    if (a >= 40 && b >= 100) return 20;
    return 6;
  }

  if (expectedMode === "ced") {
    if (a === 9 || b === 9) return 30;
    if (Math.max(a, b) >= 5) return 12;
    if ((a === 1 && b === 0) || (a === 0 && b === 1)) return -8;
    return 8;
  }

  if (expectedMode === "ctl") {
    if (a === 3 || b === 3) return 28;
    if (Math.max(a, b) >= 2) return 10;
    if (a === 0 && b === 0) return -20;
    return 8;
  }

  return 0;
}

function normalizeMode(mode) {
  const clean = String(mode || "").trim().toLowerCase();

  if (clean === "hp" || clean.includes("post")) return "hp";
  if (clean === "ced" || clean.includes("search")) return "ced";
  if (clean === "ctl" || clean.includes("control")) return "ctl";

  return "";
}

function dedupeMapsByOrder(maps) {
  const out = [];
  const seen = new Set();

  for (const map of maps || []) {
    if (seen.has(map.orderIndex)) continue;
    seen.add(map.orderIndex);
    out.push(map);
  }

  return out;
}

function buildSummary(maps, totalImages) {
  return (
    `OCR eseguito su ${totalImages} screenshot. ` +
    `Score mappa riconosciuti: ${maps.length}. ` +
    `Review manuale consigliata.`
  );
}

module.exports = {
  extractMatchDataFromImages,
};
