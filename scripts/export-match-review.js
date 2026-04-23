require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
} = require("discord.js");

const { ensureDbReady } = require("../attendance/db");
const { createMatchTables } = require("../matches/matchRepository");
const {
  getMatchList,
  getMatchDetailBySlug,
} = require("../matches/matchService");
const {
  initializeConfigStore,
  readConfig,
} = require("../config/configStore");
const {
  extractRawText,
  getImageAttachments,
  parseMatchMessage,
} = require("../matches/matchMessageParser");
const {
  parseMatchDraftFromParsedMessage,
} = require("../matches/matchUtils");

const args = process.argv.slice(2);
const outputArg = args.find(arg => !arg.startsWith("--"));
const sourceArg = args.find(arg => arg.startsWith("--from="));

const OUTPUT_PATH =
  outputArg ||
  path.join(process.cwd(), "exports", "match-review-queue.json");
const EXPORT_SOURCE = String(sourceArg || "--from=discord").split("=")[1] || "discord";

function normalizeTeamName(value) {
  return String(value || "").trim().toLowerCase();
}

function buildMessageUrl(message) {
  if (!message?.guildId || !message?.channelId || !message?.id) return "";
  return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
}

function isValidPart1(parsed) {
  return (
    !parsed.resultLine &&
    Boolean(parsed.title) &&
    Boolean(parsed.dateLine) &&
    (Boolean(parsed.timeLine) || parsed.mapLines.length > 0)
  );
}

function isValidPart2(parsed) {
  return Boolean(parsed.title) && Boolean(parsed.dateLine) && Boolean(parsed.resultLine);
}

function buildIdentityKey(draft) {
  const teams = [normalizeTeamName(draft.team1), normalizeTeamName(draft.team2)]
    .filter(Boolean)
    .sort()
    .join("|");

  return `${teams}|${String(draft.matchDate || "")}`;
}

function buildSourcePayload(message, parsed) {
  if (!message) return null;

  return {
    guildId: message.guildId || "",
    channelId: message.channelId || "",
    messageId: message.id || "",
    createdAt: message.createdAt ? message.createdAt.toISOString() : "",
    messageUrl: buildMessageUrl(message),
    rawText: extractRawText(message),
    parsed,
  };
}

function computeSeries(team1SeriesScore, team2SeriesScore, team1, team2) {
  let winnerTeam = "";
  let resultLabel = "";

  if (
    Number.isFinite(team1SeriesScore) &&
    Number.isFinite(team2SeriesScore)
  ) {
    if (team1SeriesScore > team2SeriesScore) {
      winnerTeam = team1;
      resultLabel = "Vittoria";
    } else if (team2SeriesScore > team1SeriesScore) {
      winnerTeam = team2;
      resultLabel = "Sconfitta";
    } else {
      resultLabel = "Pareggio";
    }
  }

  return {
    resultLabel,
    winnerTeam,
    team1SeriesScore:
      Number.isFinite(team1SeriesScore) ? team1SeriesScore : null,
    team2SeriesScore:
      Number.isFinite(team2SeriesScore) ? team2SeriesScore : null,
  };
}

function alignSeriesFromDraft(draft, team1, team2) {
  if (!draft) {
    return computeSeries(null, null, team1, team2);
  }

  const sameOrientation =
    normalizeTeamName(draft.team1) === normalizeTeamName(team1) &&
    normalizeTeamName(draft.team2) === normalizeTeamName(team2);

  if (sameOrientation) {
    return computeSeries(
      draft.team1SeriesScore,
      draft.team2SeriesScore,
      team1,
      team2
    );
  }

  const swappedOrientation =
    normalizeTeamName(draft.team1) === normalizeTeamName(team2) &&
    normalizeTeamName(draft.team2) === normalizeTeamName(team1);

  if (swappedOrientation) {
    return computeSeries(
      draft.team2SeriesScore,
      draft.team1SeriesScore,
      team1,
      team2
    );
  }

  return computeSeries(
    draft.team1SeriesScore,
    draft.team2SeriesScore,
    team1,
    team2
  );
}

function buildManualTemplate(entry) {
  return {
    apply: false,
    status: entry.status === "cancelled" ? "cancelled" : entry.status || "published",
    resultLabel: entry.series?.resultLabel || "",
    winnerTeam: entry.series?.winnerTeam || "",
    team1SeriesScore: entry.series?.team1SeriesScore ?? null,
    team2SeriesScore: entry.series?.team2SeriesScore ?? null,
    needsReview: false,
    maps: (entry.maps || []).map(map => ({
      orderIndex: map.orderIndex,
      mode: map.mode || "",
      map: map.mapName || "",
      side: map.sideName || "",
      team1Score: map.team1Score ?? null,
      team2Score: map.team2Score ?? null,
    })),
    players: [],
  };
}

function buildScreenshotPayload(part2Entry) {
  if (!part2Entry?.message) return [];

  return getImageAttachments(part2Entry.message).map((attachment, index) => ({
    sortOrder: index + 1,
    url: attachment.url || "",
    sourceMessageId: part2Entry.message.id || "",
  }));
}

function buildExportEntryFromSource({
  part1Entry,
  part2Entry,
  duplicateIndex,
  duplicateCount,
  orphanPart2 = false,
}) {
  const primaryDraft = part1Entry?.draft || part2Entry?.draft;
  const team1 = part1Entry?.draft?.team1 || part2Entry?.draft?.team1 || "";
  const team2 = part1Entry?.draft?.team2 || part2Entry?.draft?.team2 || "";
  const baseSlug =
    primaryDraft?.slug ||
    `match-${part1Entry?.message?.id || part2Entry?.message?.id || Date.now()}`;
  const slug =
    duplicateCount > 1 || orphanPart2
      ? `${baseSlug}-${duplicateIndex + 1}`
      : baseSlug;

  const entry = {
    slug,
    baseSlug,
    team1,
    team2,
    matchDate: String(primaryDraft?.matchDate || ""),
    matchTime: String(part1Entry?.draft?.matchTime || ""),
    status: part2Entry ? "published" : "draft",
    needsReview: Boolean(part2Entry),
    series: alignSeriesFromDraft(part2Entry?.draft, team1, team2),
    maps: (part1Entry?.draft?.maps || []).map(map => ({
      orderIndex: map.orderIndex,
      mode: map.mode || "",
      mapName: map.map || "",
      sideName: map.side || "",
      team1Score: map.team1Score ?? null,
      team2Score: map.team2Score ?? null,
    })),
    players: [],
    screenshots: buildScreenshotPayload(part2Entry),
    analysisVersion: 0,
    lastAnalyzedAt: "",
    analysisDebug: null,
    source: {
      part1: buildSourcePayload(part1Entry?.message, part1Entry?.parsed),
      part2: buildSourcePayload(part2Entry?.message, part2Entry?.parsed),
    },
    notes: orphanPart2
      ? "Parte 2 trovata senza Parte 1 corrispondente."
      : "",
  };

  entry.manual_review = buildManualTemplate(entry);
  return entry;
}

async function fetchAllMessages(channel) {
  const collected = [];
  let before = "";

  while (true) {
    const batch = await channel.messages.fetch(
      before ? { limit: 100, before, cache: false } : { limit: 100, cache: false }
    );

    if (!batch.size) {
      break;
    }

    const messages = [...batch.values()];
    collected.push(...messages);
    before = messages[messages.length - 1].id;

    if (channel.messages?.cache?.size) {
      channel.messages.cache.clear();
    }

    if (batch.size < 100) {
      break;
    }
  }

  return collected;
}

async function loginDiscordClient() {
  if (!process.env.TOKEN) {
    throw new Error("TOKEN Discord mancante: impossibile esportare dai canali.");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    client.login(process.env.TOKEN).catch(reject);
  });

  return client;
}

function collectSourceEntries(messages, type) {
  return messages
    .map(message => {
      const parsed = parseMatchMessage(message);
      const isValid = type === "part1" ? isValidPart1(parsed) : isValidPart2(parsed);
      if (!isValid) return null;

      const draft = parseMatchDraftFromParsedMessage(parsed, {
        referenceDate: message.createdTimestamp || message.createdAt || null,
      });

      return {
        identityKey: buildIdentityKey(draft),
        draft,
        parsed,
        message,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = a.message.createdTimestamp || 0;
      const right = b.message.createdTimestamp || 0;
      return left - right;
    });
}

function groupByIdentity(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const list = grouped.get(entry.identityKey) || [];
    list.push(entry);
    grouped.set(entry.identityKey, list);
  }

  return grouped;
}

async function exportFromDiscordSources() {
  await initializeConfigStore();
  const config = readConfig();

  const sourceChannelPart1 =
    config.targetChannel1 || config.sourceChannelPart1 || "";
  const sourceChannelPart2 =
    config.targetChannel2 || config.sourceChannelPart2 || "";

  if (!sourceChannelPart1 || !sourceChannelPart2) {
    throw new Error("Canali Parte 1 / Parte 2 non configurati.");
  }

  const client = await loginDiscordClient();

  try {
    const [part1Channel, part2Channel] = await Promise.all([
      client.channels.fetch(sourceChannelPart1),
      client.channels.fetch(sourceChannelPart2),
    ]);

    if (!part1Channel || part1Channel.type !== ChannelType.GuildText) {
      throw new Error("Canale Parte 1 non trovato o non testuale.");
    }

    if (!part2Channel || part2Channel.type !== ChannelType.GuildText) {
      throw new Error("Canale Parte 2 non trovato o non testuale.");
    }

    const [part1Messages, part2Messages] = await Promise.all([
      fetchAllMessages(part1Channel),
      fetchAllMessages(part2Channel),
    ]);

    const part1Entries = collectSourceEntries(part1Messages, "part1");
    const part2Entries = collectSourceEntries(part2Messages, "part2");

    const part1Groups = groupByIdentity(part1Entries);
    const part2Groups = groupByIdentity(part2Entries);
    const identityKeys = [...new Set([
      ...part1Groups.keys(),
      ...part2Groups.keys(),
    ])];

    const exportedMatches = [];
    let orphanPart2Count = 0;

    for (const identityKey of identityKeys) {
      const part1Group = part1Groups.get(identityKey) || [];
      const part2Group = part2Groups.get(identityKey) || [];
      const pairCount = Math.max(part1Group.length, part2Group.length);

      for (let index = 0; index < pairCount; index += 1) {
        const part1Entry = part1Group[index] || null;
        const part2Entry = part2Group[index] || null;
        const orphanPart2 = !part1Entry && Boolean(part2Entry);

        if (orphanPart2) {
          orphanPart2Count += 1;
        }

        exportedMatches.push(
          buildExportEntryFromSource({
            part1Entry,
            part2Entry,
            duplicateIndex: index,
            duplicateCount: pairCount,
            orphanPart2,
          })
        );
      }
    }

    exportedMatches.sort((a, b) => {
      const leftDate = String(a.matchDate || "");
      const rightDate = String(b.matchDate || "");

      if (leftDate !== rightDate) {
        return rightDate.localeCompare(leftDate);
      }

      const leftCreatedAt =
        a.source?.part1?.createdAt ||
        a.source?.part2?.createdAt ||
        "";
      const rightCreatedAt =
        b.source?.part1?.createdAt ||
        b.source?.part2?.createdAt ||
        "";

      return rightCreatedAt.localeCompare(leftCreatedAt);
    });

    return {
      generatedAt: new Date().toISOString(),
      exportSource: "discord",
      totalMatches: exportedMatches.length,
      sourceChannels: {
        part1: sourceChannelPart1,
        part2: sourceChannelPart2,
      },
      stats: {
        scannedPart1Messages: part1Messages.length,
        scannedPart2Messages: part2Messages.length,
        validPart1Messages: part1Entries.length,
        validPart2Messages: part2Entries.length,
        orphanPart2: orphanPart2Count,
      },
      instructions: [
        "Compila i dati dentro manual_review.",
        "Imposta manual_review.apply a true solo per i match da importare.",
        "Per i player usa orderIndex della mappa, teamName, playerName, kills, deaths, assists, points, timePlayed, impact, isMvp.",
        "Per reimportare usa: node scripts/import-match-review.js exports/match-review-queue.json",
      ],
      matches: exportedMatches,
    };
  } finally {
    client.destroy();
  }
}

function toIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildDbManualTemplate(match) {
  return {
    apply: false,
    status: match.status === "cancelled" ? "cancelled" : "published",
    resultLabel: match.result_label || "",
    winnerTeam: match.winner_team || "",
    team1SeriesScore: match.team1_series_score,
    team2SeriesScore: match.team2_series_score,
    needsReview: false,
    maps: (match.maps || []).map(map => ({
      orderIndex: map.order_index,
      mode: map.mode || "",
      map: map.map_name || "",
      side: map.side_name || "",
      team1Score: map.team1_score,
      team2Score: map.team2_score,
    })),
    players: (match.players || []).map(player => ({
      orderIndex: player.order_index || null,
      teamName: player.team_name || "",
      playerName: player.player_name || "",
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      points: player.points,
      timePlayed: player.time_played || "",
      impact: player.impact,
      isMvp: Boolean(player.is_mvp),
    })),
  };
}

function buildDbExportEntry(match) {
  return {
    slug: match.slug,
    team1: match.team1,
    team2: match.team2,
    matchDate: toIso(match.match_date),
    matchTime: match.match_time || "",
    status: match.status || "",
    needsReview: Boolean(match.needs_review),
    series: {
      resultLabel: match.result_label || "",
      winnerTeam: match.winner_team || "",
      team1SeriesScore: match.team1_series_score,
      team2SeriesScore: match.team2_series_score,
    },
    maps: (match.maps || []).map(map => ({
      orderIndex: map.order_index,
      mode: map.mode || "",
      mapName: map.map_name || "",
      sideName: map.side_name || "",
      team1Score: map.team1_score,
      team2Score: map.team2_score,
    })),
    players: (match.players || []).map(player => ({
      orderIndex: player.order_index || null,
      teamName: player.team_name || "",
      playerName: player.player_name || "",
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      points: player.points,
      timePlayed: player.time_played || "",
      impact: player.impact,
      isMvp: Boolean(player.is_mvp),
    })),
    screenshots: (match.assets || [])
      .filter(asset => asset.asset_type === "screenshot")
      .map(asset => ({
        sortOrder: asset.sort_order || 0,
        url: asset.asset_url || "",
        sourceMessageId: asset.source_message_id || "",
      })),
    analysisVersion: match.analysis_version || 0,
    lastAnalyzedAt: toIso(match.last_analyzed_at),
    analysisDebug: safeParseJson(match.analysis_debug_json),
    manual_review: buildDbManualTemplate(match),
  };
}

async function exportFromDb() {
  await ensureDbReady();
  await createMatchTables();

  const matches = await getMatchList();
  const detailedMatches = [];

  for (const match of matches) {
    const detail = await getMatchDetailBySlug(match.slug);
    if (detail) {
      detailedMatches.push(buildDbExportEntry(detail));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    exportSource: "db",
    totalMatches: detailedMatches.length,
    instructions: [
      "Compila i dati dentro manual_review.",
      "Imposta manual_review.apply a true solo per i match da importare.",
      "Per i player usa orderIndex della mappa, teamName, playerName, kills, deaths, assists, points, timePlayed, impact, isMvp.",
      "Per reimportare usa: node scripts/import-match-review.js exports/match-review-queue.json",
    ],
    matches: detailedMatches,
  };
}

async function main() {
  const payload =
    EXPORT_SOURCE === "db"
      ? await exportFromDb()
      : await exportFromDiscordSources();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  console.log(`✅ Export match review creato: ${OUTPUT_PATH}`);
  console.log(`ℹ️ Sorgente export: ${payload.exportSource}`);
  console.log(`ℹ️ Match esportati: ${payload.totalMatches}`);

  if (payload.stats) {
    console.log("ℹ️ Statistiche export:", JSON.stringify(payload.stats, null, 2));
  }
}

main().catch(error => {
  console.error("❌ Errore export match review:", error);
  process.exit(1);
});
