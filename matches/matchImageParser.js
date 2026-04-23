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
      const sourceBuffer = await downloadImageBuffer(attachment.url);

      const visionResult = await extractWithVisionModel({
        attachment,
        sourceBuffer,
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

      if (Array.isArray(visionResult.players) && visionResult.players.length > 0) {
        players.push(...visionResult.players);
      }

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

      const selectedMap = mergeExtractedMapCandidates({
        orderIndex: index + 1,
        visionMap: visionResult.map,
        ocrScore: bestScore,
        expectedMap,
      });

      if (selectedMap) {
        maps.push(selectedMap);
      }

      debug.push({
        image: index + 1,
        expectedMode,
        selectedSource: selectedMap
          ? bestScore
            ? bestSource
            : "vision"
          : "none",
        selectedScore: selectedMap
          ? `${selectedMap.team1Score}:${selectedMap.team2Score}`
          : null,
        visionScore: visionResult.map
          ? `${visionResult.map.team1Score}:${visionResult.map.team2Score}`
          : "none",
        ocrScore: bestScore
          ? `${bestScore.team1Score}:${bestScore.team2Score}`
          : "none",
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

async function extractWithVisionModel({ attachment, sourceBuffer, expectedMap, matchContext, orderIndex }) {
  const provider = resolveVisionProvider();

  if (!getOllamaBaseUrl()) {
    return { map: null, players: [], debug: { skipped: "OLLAMA_BASE_URL missing" } };
  }

  try {
    const model = getVisionModel(provider);
    const visionContext = await buildVisionImageContext({
      sourceBuffer,
      attachment,
      model,
    });

    const headerPass = await extractVisionHeaderPass({
      provider,
      model,
      visionContext,
      expectedMap,
      matchContext,
    });

    const leftPass = await extractVisionTeamPass({
      provider,
      model,
      visionContext,
      expectedMap,
      matchContext,
      side: "left",
    });

    const rightPass = await extractVisionTeamPass({
      provider,
      model,
      visionContext,
      expectedMap,
      matchContext,
      side: "right",
    });

    let normalized = normalizeVisionExtraction(
      {
        header: headerPass.header || {},
        summary_stats: headerPass.summary_stats || {},
        left_team: leftPass.team_rows || [],
        right_team: rightPass.team_rows || [],
      },
      {
        orderIndex,
        expectedMap,
        matchContext,
        outputPreview: [
          headerPass.outputPreview || "",
          leftPass.outputPreview || "",
          rightPass.outputPreview || "",
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500),
      }
    );

    let fallbackResult = null;
    if (!normalized.map || normalized.players.length === 0) {
      fallbackResult = await extractWithVisionCombinedPass({
        provider,
        attachment,
        sourceBuffer,
        expectedMap,
        matchContext,
        orderIndex,
        model,
      });
      normalized = mergeVisionExtractionResults(normalized, fallbackResult);
    }

    return {
      ...normalized,
      debug: {
        ...(normalized.debug || {}),
        provider,
        model,
        sectionPasses: {
          header: summarizeVisionSectionPass(headerPass),
          left: summarizeVisionTeamPass(leftPass),
          right: summarizeVisionTeamPass(rightPass),
          fallbackUsed: Boolean(fallbackResult),
        },
        fallback: fallbackResult?.debug || null,
      },
    };
  } catch (error) {
    return {
      map: null,
      players: [],
      debug: {
        provider,
        error: "vision_request_failed",
        preview: error.message,
      },
    };
  }
}

async function extractWithVisionCombinedPass({
  provider,
  attachment,
  sourceBuffer,
  expectedMap,
  matchContext,
  orderIndex,
  model,
}) {
  try {
    const outputTextMaxPreview = 500;
    const visionImages = await buildVisionImageInputs({
      provider,
      sourceBuffer,
      attachment,
      model,
    });

    const payload = await requestStructuredVision({
      provider,
      model,
      schemaName: "codm_match_screen_extraction",
      schema: buildVisionSchema(),
      userPrompt: buildVisionUserPrompt({ expectedMap, matchContext }),
      imageInputs: visionImages,
      maxTokens: Number(process.env.OPENAI_MATCH_VISION_MAX_TOKENS || 2600),
    });

    if (payload.error) {
      return {
        map: null,
        players: [],
        debug: {
          error: payload.error,
          preview: String(payload.outputPreview || "").slice(0, 300),
        },
      };
    }

    if (!payload.parsed) {
      return {
        map: null,
        players: [],
        debug: {
          error: "vision_json_parse_failed",
          preview: String(payload.outputPreview || "").slice(0, outputTextMaxPreview),
        },
      };
    }

    return normalizeVisionExtraction(payload.parsed, {
      orderIndex,
      expectedMap,
      matchContext,
      outputPreview: String(payload.outputPreview || "").slice(0, 300),
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

async function extractVisionHeaderPass({
  provider,
  model,
  visionContext,
  expectedMap,
  matchContext,
}) {
  const payload = await requestStructuredVision({
    provider,
    model,
    schemaName: "codm_match_header_extraction",
    schema: buildVisionHeaderSchema(),
    userPrompt: buildVisionHeaderPrompt({ expectedMap, matchContext }),
    imageInputs: getVisionImageInputsForProvider(provider, [
      visionContext.fullImageInput,
      visionContext.headerImageInput,
    ]),
    maxTokens: Number(process.env.OPENAI_MATCH_VISION_HEADER_TOKENS || 900),
  });

  if (payload.error || !payload.parsed) {
    return {
      header: {},
      summary_stats: {},
      outputPreview: payload.outputPreview || payload.error || "",
      error: payload.error || "header_parse_failed",
    };
  }

  return {
    header: payload.parsed.header || {},
    summary_stats: payload.parsed.summary_stats || {},
    outputPreview: payload.outputPreview || "",
  };
}

async function extractVisionTeamPass({
  provider,
  model,
  visionContext,
  expectedMap,
  matchContext,
  side,
}) {
  const teamName = side === "left" ? matchContext.team1 || "" : matchContext.team2 || "";
  const tableInput = side === "left" ? visionContext.leftTeamImageInput : visionContext.rightTeamImageInput;
  const rowInputs = side === "left" ? visionContext.leftRowImageInputs : visionContext.rightRowImageInputs;

  const payload = await requestStructuredVision({
    provider,
    model,
    schemaName: `codm_match_${side}_team_extraction`,
    schema: buildVisionTeamRowsSchema(),
    userPrompt: buildVisionTeamPrompt({ expectedMap, teamName, side }),
    imageInputs: getVisionImageInputsForProvider(provider, [
      visionContext.fullImageInput,
      tableInput,
      ...(rowInputs || []),
    ]),
    maxTokens: Number(process.env.OPENAI_MATCH_VISION_TEAM_TOKENS || 1800),
  });

  if (payload.error || !payload.parsed) {
    return {
      team_rows: [],
      outputPreview: payload.outputPreview || payload.error || "",
      error: payload.error || `${side}_team_parse_failed`,
    };
  }

  return {
    team_rows: sanitizeVisionTeamRows(payload.parsed.team_rows),
    outputPreview: payload.outputPreview || "",
  };
}

async function requestStructuredVision({
  model,
  schema,
  userPrompt,
  imageInputs,
  maxTokens,
}) {
  return requestOllamaStructuredVision({
    model,
    schema,
    userPrompt,
    imageInputs,
    maxTokens,
  });
}

async function requestOllamaStructuredVision({
  model,
  schema,
  userPrompt,
  imageInputs,
  maxTokens,
}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  }

  const response = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      options: {
        temperature: 0,
        num_predict: maxTokens,
      },
      messages: [
        {
          role: "system",
          content: buildVisionSystemPrompt(),
        },
        {
          role: "user",
          content: `${userPrompt}\n\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}`,
          images: Array.isArray(imageInputs) ? imageInputs.filter(Boolean) : [],
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      parsed: null,
      outputPreview: await response.text(),
      error: `vision_http_${response.status}`,
    };
  }

  const body = await response.json();
  const outputPreview = extractOllamaResponseText(body);

  return {
    parsed: tryParseVisionJson(outputPreview),
    outputPreview,
    error: "",
  };
}

function buildVisionSystemPrompt() {
  return [
    "You extract structured data from Call of Duty Mobile post-match screenshots.",
    "Return only valid structured data matching the provided schema.",
    "Prefer accuracy over completeness.",
    "Read the image row-by-row and side-by-side.",
    "If a field is not clearly visible, return null or an empty string depending on the schema.",
    "Never invent players, scores, or statistics.",
  ].join("\n");
}

function buildVisionHeaderPrompt({ expectedMap, matchContext }) {
  const team1 = matchContext.team1 || "TEAM_1";
  const team2 = matchContext.team2 || "TEAM_2";
  const expectedMode = expectedMap?.mode || "";
  const expectedMapName = expectedMap?.map_name || expectedMap?.map || "";

  return [
    "Analyze only the match header and top-right summary from this COD Mobile post-match screenshot.",
    `The left team is ${team1}.`,
    `The right team is ${team2}.`,
    `Expected mode hint: ${expectedMode || "unknown"}.`,
    `Expected map hint: ${expectedMapName || "unknown"}.`,
    "Image 1 is the full screenshot for context.",
    "Image 2 is a zoomed crop of the top header area.",
    "Return only:",
    "- result_label",
    "- team1_score and team2_score from the header",
    "- mode",
    "- map_name",
    "- raw_timestamp",
    "- top-right summary stats",
    "Do not return player rows in this pass.",
  ].join("\n");
}

function buildVisionUserPrompt({ expectedMap, matchContext }) {
  const team1 = matchContext.team1 || "TEAM_1";
  const team2 = matchContext.team2 || "TEAM_2";
  const expectedMode = expectedMap?.mode || "";
  const expectedMapName = expectedMap?.map_name || expectedMap?.map || "";

  return [
    "Analyze this Call of Duty Mobile post-match screenshot.",
    `The left scoreboard side is team1: ${team1}.`,
    `The right scoreboard side is team2: ${team2}.`,
    `Expected mode hint: ${expectedMode || "unknown"}.`,
    `Expected map hint: ${expectedMapName || "unknown"}.`,
    "Images are provided in this order:",
    "1. full screenshot",
    "2. header crop",
    "3. left team table crop",
    "4. right team table crop",
    "Read these blocks separately:",
    "1. Header top-left: result label, map score, mode, map name, timestamp.",
    "2. Summary top-right: PE ottenuti, Rapporto U/M, Precisione, Colpo alla testa.",
    "3. Left team table: five rows from rank 1 to 5.",
    "4. Right team table: five rows from rank 1 to 5.",
    "Important rules:",
    "- team1_score and team2_score are the final MAP score in the header, not player points.",
    "- score inside player rows is the PUNTEGGIO column.",
    "- always return exactly 5 rows for left_team and 5 rows for right_team when the table is visible.",
    "- if a row is partially unreadable, keep the row position and fill unknown fields with null or empty string.",
    "- keep stylized player names as seen in the image when possible.",
    "- do not leave left_team or right_team empty if player rows are visible in the crops.",
    "- HP usually ends with one side at 250, Search at 9, Control at 3. Use that only as a weak hint.",
  ].join("\n");
}

function buildVisionTeamPrompt({ expectedMap, teamName, side }) {
  const expectedMode = expectedMap?.mode || "";
  const expectedMapName = expectedMap?.map_name || expectedMap?.map || "";

  return [
    `Analyze only the ${side} team roster table from this COD Mobile post-match screenshot.`,
    `This team should be: ${teamName || "unknown team"}.`,
    `Expected mode hint: ${expectedMode || "unknown"}.`,
    `Expected map hint: ${expectedMapName || "unknown"}.`,
    "Image 1 is the full screenshot for context.",
    "Image 2 is the full team table crop.",
    "The remaining images are row crops ordered from rank 1 to rank 5.",
    "Return exactly 5 rows in team_rows.",
    "Each output row must correspond to the same visual row index.",
    "Extract:",
    "- rank",
    "- player_name",
    "- score from the PUNTEGGIO column",
    "- kills, deaths, assists from U/M/A",
    "- time from TEMPO",
    "- impact from IMPATTO",
    "- is_mvp",
    "If a field is unreadable, return null or empty string.",
    "Do not invent player names.",
  ].join("\n");
}

function buildVisionHeaderSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["header", "summary_stats"],
    properties: {
      header: {
        type: "object",
        additionalProperties: false,
        required: [
          "result_label",
          "team1_score",
          "team2_score",
          "mode",
          "map_name",
          "raw_timestamp",
        ],
        properties: {
          result_label: { type: "string" },
          team1_score: nullableIntegerSchema(),
          team2_score: nullableIntegerSchema(),
          mode: { type: "string" },
          map_name: { type: "string" },
          raw_timestamp: { type: "string" },
        },
      },
      summary_stats: {
        type: "object",
        additionalProperties: false,
        required: [
          "pe_ottenuti",
          "rapporto_um",
          "precisione_pct",
          "headshot_pct",
        ],
        properties: {
          pe_ottenuti: nullableIntegerSchema(),
          rapporto_um: nullableNumberSchema(),
          precisione_pct: nullableNumberSchema(),
          headshot_pct: nullableNumberSchema(),
        },
      },
    },
  };
}

function buildVisionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["header", "summary_stats", "left_team", "right_team"],
    properties: {
      header: {
        type: "object",
        additionalProperties: false,
        required: [
          "result_label",
          "team1_score",
          "team2_score",
          "mode",
          "map_name",
          "raw_timestamp",
        ],
        properties: {
          result_label: { type: "string" },
          team1_score: nullableIntegerSchema(),
          team2_score: nullableIntegerSchema(),
          mode: { type: "string" },
          map_name: { type: "string" },
          raw_timestamp: { type: "string" },
        },
      },
      summary_stats: {
        type: "object",
        additionalProperties: false,
        required: [
          "pe_ottenuti",
          "rapporto_um",
          "precisione_pct",
          "headshot_pct",
        ],
        properties: {
          pe_ottenuti: nullableIntegerSchema(),
          rapporto_um: nullableNumberSchema(),
          precisione_pct: nullableNumberSchema(),
          headshot_pct: nullableNumberSchema(),
        },
      },
      left_team: teamRowsSchema(),
      right_team: teamRowsSchema(),
    },
  };
}

function buildVisionTeamRowsSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["team_rows"],
    properties: {
      team_rows: teamRowsSchema(),
    },
  };
}

function teamRowsSchema() {
  return {
    type: "array",
    minItems: 5,
    maxItems: 5,
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        "rank",
        "player_name",
        "score",
        "kills",
        "deaths",
        "assists",
        "time",
        "impact",
        "is_mvp",
      ],
      properties: {
        rank: nullableIntegerSchema(),
        player_name: { type: "string" },
        score: nullableIntegerSchema(),
        kills: nullableIntegerSchema(),
        deaths: nullableIntegerSchema(),
        assists: nullableIntegerSchema(),
        time: { type: "string" },
        impact: nullableIntegerSchema(),
        is_mvp: { type: "boolean" },
      },
    },
  };
}

function nullableIntegerSchema() {
  return {
    anyOf: [{ type: "integer" }, { type: "null" }],
  };
}

function nullableNumberSchema() {
  return {
    anyOf: [{ type: "number" }, { type: "null" }],
  };
}

function extractStructuredVisionPayload(payload) {
  if (payload && typeof payload.output_parsed === "object" && payload.output_parsed) {
    return payload.output_parsed;
  }

  const outputText = extractResponseOutputText(payload);
  return tryParseVisionJson(outputText);
}

function extractResponseOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text);
      }
      if (typeof content?.output_text === "string" && content.output_text.trim()) {
        chunks.push(content.output_text);
      }
    }
  }

  return chunks.join("\n");
}

function extractOllamaResponseText(payload) {
  return String(payload?.message?.content || "").trim();
}

function resolveVisionProvider() {
  return "ollama";
}

function getVisionModel(provider) {
  return process.env.OLLAMA_MATCH_VISION_MODEL || "glm-ocr:latest";
}

function getOllamaBaseUrl() {
  const raw = String(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function getVisionImageInputsForProvider(provider, inputs) {
  const filtered = (inputs || []).filter(Boolean);

  if (provider === "ollama") {
    return filtered.map(input => input.ollamaBase64 || "").filter(Boolean);
  }

  return filtered.map(input => input.openAiInput || null).filter(Boolean);
}

function getVisionDetailLevel(model) {
  const configured = String(process.env.OPENAI_MATCH_VISION_DETAIL || "").trim().toLowerCase();
  if (configured) return configured;

  if (/^gpt-5\.4/i.test(String(model || ""))) {
    return "original";
  }

  return "high";
}

async function buildVisionImageContext({ sourceBuffer, attachment, model }) {
  const metadata = await sharp(sourceBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const detail = getVisionDetailLevel(model);

  const fullImageInput = buildVisionImageInput({
    openAiUrl: attachment.url,
    ollamaBase64: sourceBuffer.toString("base64"),
    detail,
  });

  if (!width || !height) {
    return {
      fullImageInput,
      headerImageInput: null,
      leftTeamImageInput: null,
      rightTeamImageInput: null,
      leftRowImageInputs: [],
      rightRowImageInputs: [],
    };
  }

  const [headerCrop, leftTeamCrop, rightTeamCrop] = buildVisionCropSpecs(width, height);
  const leftRowCrops = buildVisionTeamRowCropSpecs(leftTeamCrop);
  const rightRowCrops = buildVisionTeamRowCropSpecs(rightTeamCrop);

  return {
    fullImageInput,
    headerImageInput: await buildVisionCropInput(sourceBuffer, headerCrop),
    leftTeamImageInput: await buildVisionCropInput(sourceBuffer, leftTeamCrop),
    rightTeamImageInput: await buildVisionCropInput(sourceBuffer, rightTeamCrop),
    leftRowImageInputs: await buildVisionRowImageInputs(sourceBuffer, leftRowCrops),
    rightRowImageInputs: await buildVisionRowImageInputs(sourceBuffer, rightRowCrops),
  };
}

async function buildVisionImageInputs({ provider, sourceBuffer, attachment, model }) {
  const metadata = await sharp(sourceBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const detail = getVisionDetailLevel(model);

  const inputs = [
    buildVisionImageInput({
      openAiUrl: attachment.url,
      ollamaBase64: sourceBuffer.toString("base64"),
      detail,
    }),
  ];

  if (!width || !height) {
    return getVisionImageInputsForProvider(provider, inputs);
  }

  const cropSpecs = buildVisionCropSpecs(width, height);

  for (const crop of cropSpecs) {
    inputs.push(await buildVisionCropInput(sourceBuffer, crop));
  }

  return getVisionImageInputsForProvider(provider, inputs);
}

function buildVisionCropSpecs(width, height) {
  return [
    {
      name: "header",
      left: Math.floor(width * 0.0),
      top: Math.floor(height * 0.0),
      width: Math.floor(width * 0.68),
      height: Math.floor(height * 0.28),
      resizeWidth: 1800,
    },
    {
      name: "left_team",
      left: Math.floor(width * 0.0),
      top: Math.floor(height * 0.24),
      width: Math.floor(width * 0.50),
      height: Math.floor(height * 0.62),
      resizeWidth: 1900,
    },
    {
      name: "right_team",
      left: Math.floor(width * 0.50),
      top: Math.floor(height * 0.24),
      width: Math.floor(width * 0.50),
      height: Math.floor(height * 0.62),
      resizeWidth: 1900,
    },
  ];
}

function buildVisionTeamRowCropSpecs(teamCrop) {
  const headerHeight = Math.floor(teamCrop.height * 0.125);
  const bodyTop = teamCrop.top + headerHeight;
  const bodyHeight = Math.max(1, teamCrop.height - headerHeight);
  const rowHeight = Math.max(1, Math.floor(bodyHeight / 5));

  return Array.from({ length: 5 }, (_, index) => {
    const top = Math.max(teamCrop.top, bodyTop + index * rowHeight - 6);
    const bottom = Math.min(
      teamCrop.top + teamCrop.height,
      bodyTop + (index + 1) * rowHeight + 6
    );

    return {
      name: `${teamCrop.name}_row_${index + 1}`,
      left: teamCrop.left,
      top,
      width: teamCrop.width,
      height: Math.max(1, bottom - top),
      resizeWidth: 1900,
    };
  });
}

async function buildVisionRowImageInputs(sourceBuffer, crops) {
  const inputs = [];

  for (const crop of crops || []) {
    inputs.push(await buildVisionCropInput(sourceBuffer, crop));
  }

  return inputs;
}

async function buildVisionCropInput(sourceBuffer, crop) {
  const imageUrl = await buildCropDataUrl(sourceBuffer, crop);
  return buildVisionImageInput({
    openAiUrl: imageUrl,
    ollamaBase64: extractBase64FromDataUrl(imageUrl),
    detail: "high",
  });
}

function buildVisionImageInput({ openAiUrl, ollamaBase64, detail }) {
  return {
    openAiInput: {
      type: "input_image",
      image_url: openAiUrl,
      detail,
    },
    ollamaBase64,
  };
}

async function buildCropDataUrl(sourceBuffer, crop) {
  const buffer = await sharp(sourceBuffer)
    .rotate()
    .extract({
      left: Math.max(0, crop.left),
      top: Math.max(0, crop.top),
      width: Math.max(1, crop.width),
      height: Math.max(1, crop.height),
    })
    .resize({
      width: crop.resizeWidth || undefined,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function extractBase64FromDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const marker = "base64,";
  const index = raw.indexOf(marker);
  return index === -1 ? raw : raw.slice(index + marker.length);
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

function sanitizeVisionTeamRows(rows) {
  const source = Array.isArray(rows) ? rows : [];

  return Array.from({ length: 5 }, (_, index) => {
    const row = source[index] || {};
    return {
      rank: toNullableInteger(row.rank) ?? index + 1,
      player_name: String(row.player_name || "").trim(),
      score: toNullableInteger(row.score),
      kills: toNullableInteger(row.kills),
      deaths: toNullableInteger(row.deaths),
      assists: toNullableInteger(row.assists),
      time: String(row.time || "").trim(),
      impact: toNullableInteger(row.impact),
      is_mvp: Boolean(row.is_mvp),
    };
  });
}

function normalizeVisionExtraction(parsed, { orderIndex, expectedMap, matchContext, outputPreview }) {
  const rawHeader = parsed?.header || parsed?.map || {};
  const rawSummary = parsed?.summary_stats || {};
  const normalizedMode = normalizeMode(rawHeader.mode || expectedMap?.mode || "");
  const team1Score = toNullableInteger(rawHeader.team1_score);
  const team2Score = toNullableInteger(rawHeader.team2_score);

  const map = isPlausibleScore(team1Score, team2Score, normalizedMode)
    ? {
        orderIndex,
        team1Score,
        team2Score,
        mode: rawHeader.mode || expectedMap?.mode || "",
        map: rawHeader.map_name || rawHeader.map || expectedMap?.map_name || expectedMap?.map || "",
        side: rawHeader.side_name || rawHeader.side || expectedMap?.side_name || expectedMap?.side || "",
      }
    : null;

  const combinedPlayers = [];

  if (Array.isArray(parsed?.left_team)) {
    combinedPlayers.push(...parsed.left_team.map(player => ({ ...player, side: "left" })));
  }

  if (Array.isArray(parsed?.right_team)) {
    combinedPlayers.push(...parsed.right_team.map(player => ({ ...player, side: "right" })));
  }

  if (!combinedPlayers.length && Array.isArray(parsed?.players)) {
    combinedPlayers.push(...parsed.players);
  }

  const players = dedupePlayers(
    combinedPlayers
      .map(player => normalizeVisionPlayer(player, {
        orderIndex,
        team1: matchContext.team1 || "",
        team2: matchContext.team2 || "",
      }))
      .filter(Boolean)
  );

  return {
    map,
    players,
    debug: {
      outputPreview,
      header: {
        resultLabel: rawHeader.result_label || "",
        mode: rawHeader.mode || "",
        mapName: rawHeader.map_name || rawHeader.map || "",
        rawTimestamp: rawHeader.raw_timestamp || "",
      },
      summary: {
        peOttenuti: toNullableInteger(rawSummary.pe_ottenuti),
        rapportoUm: toNullableNumber(rawSummary.rapporto_um),
        precisionePct: toNullableNumber(rawSummary.precisione_pct),
        headshotPct: toNullableNumber(rawSummary.headshot_pct),
      },
      rawCounts: {
        leftTeamRows: Array.isArray(parsed?.left_team) ? parsed.left_team.length : 0,
        rightTeamRows: Array.isArray(parsed?.right_team) ? parsed.right_team.length : 0,
      },
      parsedPlayers: players.length,
      parsedMap: map ? `${map.team1Score}:${map.team2Score}` : "none",
    },
  };
}

function mergeVisionExtractionResults(primary, fallback) {
  const primaryPlayers = Array.isArray(primary?.players) ? primary.players : [];
  const fallbackPlayers = Array.isArray(fallback?.players) ? fallback.players : [];

  return {
    map: primary?.map || fallback?.map || null,
    players:
      primaryPlayers.length >= fallbackPlayers.length
        ? primaryPlayers
        : fallbackPlayers,
    debug: {
      ...(primary?.debug || {}),
      merge: {
        primaryPlayers: primaryPlayers.length,
        fallbackPlayers: fallbackPlayers.length,
        selectedPlayers:
          primaryPlayers.length >= fallbackPlayers.length
            ? primaryPlayers.length
            : fallbackPlayers.length,
        primaryMap: primary?.map
          ? `${primary.map.team1Score}:${primary.map.team2Score}`
          : "none",
        fallbackMap: fallback?.map
          ? `${fallback.map.team1Score}:${fallback.map.team2Score}`
          : "none",
      },
    },
  };
}

function summarizeVisionSectionPass(section) {
  return {
    error: section?.error || "",
    outputPreview: String(section?.outputPreview || "").slice(0, 180),
    hasHeader: Boolean(section?.header && Object.keys(section.header).length),
  };
}

function summarizeVisionTeamPass(section) {
  const rows = Array.isArray(section?.team_rows) ? section.team_rows : [];
  const namedRows = rows.filter(row => String(row?.player_name || "").trim()).length;

  return {
    error: section?.error || "",
    rowCount: rows.length,
    namedRows,
    outputPreview: String(section?.outputPreview || "").slice(0, 180),
  };
}

function normalizeVisionPlayer(player, { orderIndex, team1, team2 }) {
  const side = String(player?.side || "").trim().toLowerCase();
  const teamName = side === "left" ? team1 : side === "right" ? team2 : "";
  const playerName = normalizePlayerName(
    player?.player_name || player?.name || ""
  );

  if (!teamName || !playerName) return null;

  return {
    orderIndex,
    teamName,
    playerName,
    kills: toNullableInteger(player?.kills),
    deaths: toNullableInteger(player?.deaths),
    assists: toNullableInteger(player?.assists),
    points: toNullableInteger(player?.score ?? player?.points),
    timePlayed: normalizeClockValue(player?.time),
    impact: toNullableInteger(player?.impact),
    isMvp: Boolean(player?.is_mvp),
  };
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "."));
  return Number.isInteger(parsed) ? parsed : null;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(
    String(value)
      .replace(/%/g, "")
      .replace(/,/g, ".")
      .trim()
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlayerName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClockValue(value) {
  const clean = String(value || "").trim();
  return /^\d{1,2}:\d{2}$/.test(clean) ? clean : "";
}

function dedupePlayers(players) {
  const output = [];
  const seen = new Set();

  for (const player of players || []) {
    const key = `${player.orderIndex}|${player.teamName}|${player.playerName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(player);
  }

  return output;
}

function mergeExtractedMapCandidates({ orderIndex, visionMap, ocrScore, expectedMap }) {
  const base = {
    orderIndex,
    mode: visionMap?.mode || expectedMap?.mode || "",
    map: visionMap?.map || expectedMap?.map_name || expectedMap?.map || "",
    side: visionMap?.side || expectedMap?.side_name || expectedMap?.side || "",
  };

  if (ocrScore) {
    return {
      ...base,
      team1Score: ocrScore.team1Score,
      team2Score: ocrScore.team2Score,
    };
  }

  if (visionMap) {
    return {
      ...base,
      team1Score: visionMap.team1Score,
      team2Score: visionMap.team2Score,
    };
  }

  return null;
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
    `Analisi immagini eseguita su ${totalImages} screenshot. ` +
    `Score mappa riconosciuti: ${maps.length}. ` +
    `Player riconosciuti: ${totalPlayers}. ` +
    `Review manuale consigliata.`
  );
}

module.exports = {
  extractMatchDataFromImages,
};
