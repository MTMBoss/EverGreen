const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function extractMatchDataFromImages(attachments, expectedMaps = [], matchContext = {}) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return {
      maps: [],
      players: [],
      needsReview: true,
      extractionSummary: "Nessuno screenshot trovato nella Parte 2.",
    };
  }

  const maps = [];
  const players = [];
  const debug = [];
  let worker = null;

  try {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const expectedMap = expectedMaps[index] || null;
      const expectedMode = normalizeMode(expectedMap?.mode || "");
      let sourceBuffer = null;

      const visionResult = await extractWithVisionModel({
        attachment,
        expectedMap,
        matchContext,
        orderIndex: index + 1,
      });

      if (visionResult.debug) {
        debug.push({
          image: index + 1,
          provider: "vision",
          ...visionResult.debug,
        });
      }

      if (visionResult.map) {
        maps.push(visionResult.map);
      }

      if (Array.isArray(visionResult.players) && visionResult.players.length > 0) {
        players.push(...visionResult.players);
      }

      if (visionResult.map) {
        continue;
      }

      sourceBuffer = await downloadImageBuffer(attachment.url);
      worker = await ensureOcrWorker(worker);

      const metadata = await sharp(sourceBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      const scoreZones = buildScoreZones(width, height);
      const scoreBoxes = buildScoreBoxes(width, height);

      let bestScore = null;
      let bestWeight = -1;
      let bestSource = "none";

      for (const box of scoreBoxes) {
        const boxScore = await extractScoreFromBoxes({
          buffer: sourceBuffer,
          boxes: box,
          worker,
          expectedMode,
        });

        debug.push({
          image: index + 1,
          expectedMode,
          boxSet: box.name,
          leftPreview: boxScore.leftText,
          rightPreview: boxScore.rightText,
          combinedPreview: boxScore.combinedText,
          score: boxScore.score,
        });

        if (boxScore.score) {
          const weight = box.baseWeight + boxScore.score.weight;
          if (weight > bestWeight) {
            bestWeight = weight;
            bestScore = boxScore.score;
            bestSource = `boxes:${box.name}`;
          }
        }
      }

      for (const zone of scoreZones) {
        const zoneVariants = await buildZoneVariants(sourceBuffer, zone);

        for (const variant of zoneVariants) {
          if (zone.parser === "digits") {
            await worker.setParameters({
              tessedit_char_whitelist: "0123456789:-",
            });
          } else {
            await worker.setParameters({
              tessedit_char_whitelist: "",
            });
          }

          const result = await worker.recognize(variant.buffer);
          const text = normalizeOcrText(result.data?.text || "");
          const confidence = Number(result.data?.confidence || 0);

          let score = null;

          if (zone.parser === "digits") {
            score = extractScoreFromScoreboxText(text, expectedMode);
          } else {
            score = extractScoreNearOutcome(text, expectedMode);
          }

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
    if (worker) {
      await worker.terminate();
    }
  }

  return {
    maps: dedupeMapsByOrder(maps),
    players,
    needsReview: true,
    extractionSummary: buildSummary(maps, attachments.length, players.length),
    debug,
  };
}

async function ensureOcrWorker(worker) {
  if (worker) return worker;
  return createWorker("eng");
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
      name: "score_digits_tight",
      parser: "digits",
      left: Math.floor(width * 0.145),
      top: Math.floor(height * 0.075),
      width: Math.floor(width * 0.16),
      height: Math.floor(height * 0.09),
      baseWeight: 100,
    },
    {
      name: "score_digits_medium",
      parser: "digits",
      left: Math.floor(width * 0.11),
      top: Math.floor(height * 0.055),
      width: Math.floor(width * 0.24),
      height: Math.floor(height * 0.11),
      baseWeight: 90,
    },
    {
      name: "header_left_tight",
      parser: "outcome",
      left: Math.floor(width * 0.00),
      top: Math.floor(height * 0.00),
      width: Math.floor(width * 0.38),
      height: Math.floor(height * 0.14),
      baseWeight: 125,
    },
    {
      name: "header_left_medium",
      parser: "outcome",
      left: Math.floor(width * 0.00),
      top: Math.floor(height * 0.00),
      width: Math.floor(width * 0.45),
      height: Math.floor(height * 0.18),
      baseWeight: 100,
    },
    {
      name: "header_top_full",
      parser: "outcome",
      left: 0,
      top: 0,
      width,
      height: Math.floor(height * 0.20),
      baseWeight: 70,
    },
  ];
}

function buildScoreBoxes(width, height) {
  if (!width || !height) return [];

  return [
    {
      name: "score_pair_tight",
      baseWeight: 100,
      leftBox: {
        left: Math.floor(width * 0.135),
        top: Math.floor(height * 0.066),
        width: Math.floor(width * 0.078),
        height: Math.floor(height * 0.085),
      },
      rightBox: {
        left: Math.floor(width * 0.205),
        top: Math.floor(height * 0.066),
        width: Math.floor(width * 0.095),
        height: Math.floor(height * 0.085),
      },
    },
    {
      name: "score_pair_medium",
      baseWeight: 90,
      leftBox: {
        left: Math.floor(width * 0.12),
        top: Math.floor(height * 0.055),
        width: Math.floor(width * 0.09),
        height: Math.floor(height * 0.095),
      },
      rightBox: {
        left: Math.floor(width * 0.20),
        top: Math.floor(height * 0.055),
        width: Math.floor(width * 0.11),
        height: Math.floor(height * 0.095),
      },
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
    .resize({
      width: zone.parser === "digits" ? 2200 : 1700,
      withoutEnlargement: false,
    });

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

async function buildDigitBoxVariants(buffer, box) {
  const cropped = sharp(buffer)
    .rotate()
    .extract({
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    })
    .resize({ width: 1200, withoutEnlargement: false });

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

async function extractWithVisionModel({ attachment, expectedMap, matchContext, orderIndex }) {
  if (!process.env.OPENAI_API_KEY) {
    return { map: null, players: [], debug: { skipped: "OPENAI_API_KEY missing" } };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MATCH_VISION_MODEL || "gpt-4.1-mini",
        max_output_tokens: Number(process.env.OPENAI_MATCH_VISION_MAX_TOKENS || 1600),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildVisionPrompt({ expectedMap, matchContext }),
              },
              {
                type: "input_image",
                image_url: attachment.url,
                detail: "high",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        map: null,
        players: [],
        debug: {
          error: `vision_http_${response.status}`,
          preview: errorText.slice(0, 300),
        },
      };
    }

    const payload = await response.json();
    const outputText = String(payload.output_text || "");
    const parsed = tryParseVisionJson(outputText);

    if (!parsed) {
      return {
        map: null,
        players: [],
        debug: {
          error: "vision_json_parse_failed",
          preview: outputText.slice(0, 300),
        },
      };
    }

    return normalizeVisionExtraction(parsed, {
      orderIndex,
      expectedMap,
      matchContext,
      outputPreview: outputText.slice(0, 300),
    });
  } catch (error) {
    return {
      map: null,
      players: [],
      debug: {
        error: "vision_request_failed",
        preview: error.message,
      },
    };
  }
}

function buildVisionPrompt({ expectedMap, matchContext }) {
  const team1 = matchContext.team1 || "TEAM_1";
  const team2 = matchContext.team2 || "TEAM_2";
  const expectedMode = expectedMap?.mode || "";
  const expectedMapName = expectedMap?.map_name || expectedMap?.map || "";

  return [
    "Analyze this Call of Duty Mobile post-match screenshot and return JSON only.",
    `The left scoreboard side is team1: ${team1}.`,
    `The right scoreboard side is team2: ${team2}.`,
    `Expected mode hint: ${expectedMode || "unknown"}.`,
    `Expected map hint: ${expectedMapName || "unknown"}.`,
    "Extract as much reliable information as possible.",
    "Return exactly this JSON shape:",
    JSON.stringify({
      map: {
        mode: "",
        map_name: "",
        result_label: "",
        team1_score: null,
        team2_score: null,
      },
      players: [
        {
          side: "left",
          player_name: "",
          kills: null,
          deaths: null,
          assists: null,
          points: null,
          impact: null,
          is_mvp: false,
        },
      ],
    }),
    "Rules:",
    "- JSON only, no markdown.",
    "- If a value is not visible, use null or empty string.",
    "- side must be left or right.",
    "- team1_score/team2_score must be the actual final map score, not points.",
    "- For HP one side should usually be 250, for Search one side 9, for Control one side 3.",
  ].join("\n");
}

function tryParseVisionJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeVisionExtraction(parsed, { orderIndex, expectedMap, matchContext, outputPreview }) {
  const rawMap = parsed?.map || {};
  const normalizedMode = normalizeMode(rawMap.mode || expectedMap?.mode || "");
  const team1Score = toNullableInteger(rawMap.team1_score);
  const team2Score = toNullableInteger(rawMap.team2_score);

  const map = isPlausibleScore(team1Score, team2Score, normalizedMode)
    ? {
        orderIndex,
        team1Score,
        team2Score,
        mode: rawMap.mode || expectedMap?.mode || "",
        map: rawMap.map_name || rawMap.map || expectedMap?.map_name || expectedMap?.map || "",
        side: rawMap.side_name || rawMap.side || expectedMap?.side_name || expectedMap?.side || "",
      }
    : null;

  const players = Array.isArray(parsed?.players)
    ? parsed.players
        .map(player => normalizeVisionPlayer(player, {
          orderIndex,
          team1: matchContext.team1 || "",
          team2: matchContext.team2 || "",
        }))
        .filter(Boolean)
    : [];

  return {
    map,
    players,
    debug: {
      outputPreview,
      parsedPlayers: players.length,
      parsedMap: map ? `${map.team1Score}:${map.team2Score}` : "none",
    },
  };
}

function normalizeVisionPlayer(player, { orderIndex, team1, team2 }) {
  const side = String(player?.side || "").trim().toLowerCase();
  const teamName = side === "left" ? team1 : side === "right" ? team2 : "";
  const playerName = String(player?.player_name || "").trim();

  if (!teamName || !playerName) return null;

  return {
    orderIndex,
    teamName,
    playerName,
    kills: toNullableInteger(player?.kills),
    deaths: toNullableInteger(player?.deaths),
    assists: toNullableInteger(player?.assists),
    points: toNullableInteger(player?.points),
    impact: toNullableInteger(player?.impact),
    isMvp: Boolean(player?.is_mvp),
  };
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function extractScoreFromBoxes({ buffer, boxes, worker, expectedMode }) {
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789:-",
  });

  const left = await recognizeBestDigitBox(buffer, boxes.leftBox, worker);
  const right = await recognizeBestDigitBox(buffer, boxes.rightBox, worker);
  const score = buildScoreFromRecognizedDigits(left.value, right.value, expectedMode);

  return {
    leftText: left.text,
    rightText: right.text,
    combinedText: `${left.text}:${right.text}`,
    score,
  };
}

async function recognizeBestDigitBox(buffer, box, worker) {
  const variants = await buildDigitBoxVariants(buffer, box);
  let best = {
    text: "",
    value: null,
    weight: -1,
  };

  for (const variant of variants) {
    const result = await worker.recognize(variant.buffer);
    const text = normalizeDigitText(result.data?.text || "");
    const confidence = Number(result.data?.confidence || 0);
    const parsed = parseDigitCandidate(text);
    const weight = confidence + parsed.weight;

    if (weight > best.weight) {
      best = {
        text,
        value: parsed.value,
        weight,
      };
    }
  }

  return best;
}

function normalizeDigitText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[Oo]/g, "0")
    .replace(/[IiLl]/g, "1")
    .replace(/[^0-9]/g, "");
}

function parseDigitCandidate(text) {
  const digits = String(text || "").replace(/[^0-9]/g, "");
  if (!digits) {
    return { value: null, weight: -20 };
  }

  const normalized = digits.length > 3 ? digits.slice(0, 3) : digits;
  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    return { value: null, weight: -20 };
  }

  let weight = 0;
  if (normalized.length >= 2) weight += 12;
  if (normalized.length === 3) weight += 18;

  return { value, weight };
}

function buildScoreFromRecognizedDigits(leftValue, rightValue, expectedMode) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return null;
  }

  const direct = scoreCandidate(leftValue, rightValue, expectedMode, 120);
  if (direct) return direct;

  if (expectedMode === "hp") {
    const leftReduced = reduceHpDigitNoise(leftValue);
    const rightReduced = reduceHpDigitNoise(rightValue);

    const reduced = scoreCandidate(leftReduced, rightReduced, expectedMode, 105);
    if (reduced) return reduced;
  }

  return null;
}

function reduceHpDigitNoise(value) {
  if (!Number.isFinite(value)) return null;
  if (value <= 250) return value;

  const digits = String(value).replace(/[^0-9]/g, "");
  const candidates = [];

  if (digits.length >= 2) {
    candidates.push(Number(digits.slice(0, 2)));
    candidates.push(Number(digits.slice(-2)));
  }

  if (digits.length >= 3) {
    candidates.push(Number(digits.slice(0, 3)));
    candidates.push(Number(digits.slice(-3)));
  }

  const plausible = candidates.find(candidate => Number.isFinite(candidate) && candidate <= 250);
  return plausible ?? value;
}

function scoreCandidate(left, right, expectedMode, baseWeight) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (!isPlausibleScore(left, right, expectedMode)) return null;

  return {
    team1Score: left,
    team2Score: right,
    weight: baseWeight + modeBonus(left, right, expectedMode),
  };
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

function extractScoreFromScoreboxText(text, expectedMode) {
  const compact = String(text || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/O/g, "0")
    .replace(/[^0-9:\-]/g, "");

  const directMatch = compact.match(/(\d{1,3})[:\-](\d{1,3})/);
  if (directMatch) {
    const left = Number(directMatch[1]);
    const right = Number(directMatch[2]);

    if (isPlausibleScore(left, right, expectedMode)) {
      return {
        team1Score: left,
        team2Score: right,
        weight: 150 + modeBonus(left, right, expectedMode),
      };
    }
  }

  const digitsOnly = compact.replace(/[^0-9]/g, "");
  const candidates = [];

  for (const [left, right] of buildDigitSplitCandidates(digitsOnly, expectedMode)) {
    if (!isPlausibleScore(left, right, expectedMode)) continue;

    candidates.push({
      team1Score: left,
      team2Score: right,
      weight: 130 + modeBonus(left, right, expectedMode) - Math.max(0, digitsOnly.length - 2) * 2,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0];
}

function buildDigitSplitCandidates(digitsOnly, expectedMode) {
  const candidates = [];

  if (!digitsOnly) return candidates;

  for (let splitIndex = 1; splitIndex < digitsOnly.length; splitIndex += 1) {
    const leftRaw = digitsOnly.slice(0, splitIndex);
    const rightRaw = digitsOnly.slice(splitIndex);
    const left = Number(leftRaw);
    const right = Number(rightRaw);

    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;

    if (expectedMode === "hp") {
      if (leftRaw.length < 2 || rightRaw.length < 2) continue;
    } else {
      if (leftRaw.length > 1 || rightRaw.length > 1) continue;
    }

    candidates.push([left, right]);
  }

  return candidates;
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

function buildSummary(maps, totalImages, totalPlayers = 0) {
  return (
    `OCR eseguito su ${totalImages} screenshot. ` +
    `Score mappa riconosciuti: ${maps.length}. ` +
    `Player riconosciuti: ${totalPlayers}. ` +
    `Review manuale consigliata.`
  );
}

module.exports = {
  extractMatchDataFromImages,
};
