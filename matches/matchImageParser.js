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
  const players = [];
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
      let bestScoreWeight = -1;
      let bestSource = "none";

      for (const zone of scoreZones) {
        const zoneVariants = await buildZoneVariants(sourceBuffer, zone);

        for (const variant of zoneVariants) {
          const result = await worker.recognize(variant.buffer);
          const text = normalizeOcrText(result.data?.text || "");
          const confidence = Number(result.data?.confidence || 0);

          let score = extractBestScoreFromText(text, expectedMode, true);

          if (!score) {
            score = extractBestScoreFromText(text, expectedMode, false);
          }

          debug.push({
            image: index + 1,
            expectedMode,
            zone: zone.name,
            variant: variant.name,
            confidence,
            textPreview: text.slice(0, 250),
            score,
          });

          if (score) {
            const weight = confidence + score.weight + zone.baseWeight;
            if (weight > bestScoreWeight) {
              bestScoreWeight = weight;
              bestScore = score;
              bestSource = `zone:${zone.name}:${variant.name}`;
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
        selectedScoreSource: bestSource,
        selectedScore: bestScore,
      });
    }
  } finally {
    await worker.terminate();
  }

  return {
    maps: dedupeMapsByOrder(maps),
    players,
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
      name: "score_header_left",
      left: Math.floor(width * 0.0),
      top: Math.floor(height * 0.0),
      width: Math.floor(width * 0.36),
      height: Math.floor(height * 0.18),
      baseWeight: 45,
    },
    {
      name: "score_header_full",
      left: 0,
      top: 0,
      width,
      height: Math.floor(height * 0.20),
      baseWeight: 30,
    },
    {
      name: "top_left_large",
      left: Math.floor(width * 0.0),
      top: Math.floor(height * 0.0),
      width: Math.floor(width * 0.45),
      height: Math.floor(height * 0.26),
      baseWeight: 18,
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
    .resize({ width: 1500, withoutEnlargement: false });

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
    .linear(1.22, -12)
    .threshold(185)
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

  return [
    { name: "grayscale", buffer: grayscale },
    { name: "thresholdA", buffer: thresholdA },
    { name: "thresholdB", buffer: thresholdB },
  ];
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/[|]/g, "1")
    .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0")
    .replace(/[Ss](?=\d)|(?<=\d)[Ss]/g, "5")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function extractBestScoreFromText(text, expectedMode, strictMode) {
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const candidates = [];

  for (const line of lines) {
    for (const score of extractScoresFromLine(line, expectedMode, strictMode)) {
      candidates.push({
        ...score,
        line,
        weight: scoreWeight(
          score.team1Score,
          score.team2Score,
          line,
          expectedMode,
          strictMode
        ),
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0];
}

function extractScoresFromLine(line, expectedMode, strictMode) {
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
      if (!isPlausibleScore(left, right, expectedMode, strictMode)) continue;

      results.push({
        team1Score: left,
        team2Score: right,
      });
    }
  }

  return results;
}

function isPlausibleScore(a, b, expectedMode, strictMode) {
  if (a < 0 || b < 0) return false;
  if (a > 300 || b > 300) return false;

  if (expectedMode === "hp") {
    if (a > 250 || b > 250) return false;
    if (strictMode) {
      return a === 250 || b === 250 || (a >= 100 && b >= 100);
    }
    return true;
  }

  if (expectedMode === "ced") {
    if (a > 13 || b > 13) return false;
    if (strictMode && a === 0 && b === 0) return false;
    return true;
  }

  if (expectedMode === "ctl") {
    if (a > 5 || b > 5) return false;
    if (strictMode && a === 0 && b === 0) return false;
    return true;
  }

  const hpLike = a <= 250 && b <= 250;
  const sndLike = a <= 13 && b <= 13;
  const ctlLike = a <= 5 && b <= 5;

  return hpLike || sndLike || ctlLike;
}

function scoreWeight(a, b, line, expectedMode, strictMode) {
  let score = 0;

  if (/[:\-]/.test(line)) score += 24;
  if (/sconfitta|vittoria|defeat|victory/i.test(line)) score += 50;
  if (line.length <= 24) score += 8;
  if (line.length > 50) score -= 10;

  const digits = (line.match(/\d/g) || []).length;
  if (digits > 8) score -= 14;

  if (expectedMode === "hp") {
    if (a === 250 || b === 250) score += 45;
    if (a >= 100 && b >= 100) score += 20;
    if (!strictMode) score += 8;
  }

  if (expectedMode === "ced") {
    if (a <= 13 && b <= 13) score += 22;
    if (Math.max(a, b) >= 4) score += 12;
    if ((a === 1 && b === 0) || (a === 0 && b === 1)) score -= 12;
    if (!strictMode) score += 6;
  }

  if (expectedMode === "ctl") {
    if (a <= 5 && b <= 5) score += 24;
    if (Math.max(a, b) >= 2) score += 12;
    if (a === 0 && b === 0) score -= 20;
    if (!strictMode) score += 6;
  }

  return score;
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
