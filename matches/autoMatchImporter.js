const { ChannelType } = require("discord.js");

const {
  MATCH_IMPORT_STATE_VERSION,
  readConfig,
  setMatchImportState,
} = require("../config/configStore");
const {
  extractRawText,
  parseMatchMessage,
} = require("./matchMessageParser");
const {
  createMatchDraftFromPart1,
  completeMatchFromPart2,
  buildMatchWebUrl,
  removeAllMatches,
  removeMatchById,
} = require("./matchService");
const { findMatchBySourceMessage } = require("./matchRepository");

const MATCH_IMPORT_TICK_MS = Number(
  process.env.MATCH_IMPORT_TICK_MS || 15 * 1000
);
const MATCH_IMPORT_MAX_MESSAGES_PER_CHANNEL = Number(
  process.env.MATCH_IMPORT_MAX_MESSAGES_PER_CHANNEL || 15
);

let historyImportTimer = null;
let historyImportRunning = false;

function getConfiguredMatchSourceChannels(config = readConfig()) {
  return {
    sourceChannelPart1: config.targetChannel1 || "",
    sourceChannelPart2: config.targetChannel2 || "",
  };
}

async function handleAutoMatchSourceMessage(message, client) {
  if (!message || !client) return { handled: false, imported: false, reason: "missing_context" };
  if (!message.guildId || !message.channelId) return { handled: false, imported: false, reason: "missing_channel" };

  const config = readConfig();
  const { sourceChannelPart1, sourceChannelPart2 } = getConfiguredMatchSourceChannels(config);
  const isSourcePart1 = sourceChannelPart1 && message.channelId === sourceChannelPart1;
  const isSourcePart2 = sourceChannelPart2 && message.channelId === sourceChannelPart2;

  if (!isSourcePart1 && !isSourcePart2) {
    return { handled: false, imported: false, reason: "not_source_channel" };
  }

  const parsed = parseMatchMessage(message);
  if (!parsed.title || !parsed.dateLine) {
    return { handled: true, imported: false, reason: "not_a_match" };
  }

  const alreadyImported = await findMatchBySourceMessage({
    part: isSourcePart2 ? 2 : 1,
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
  });

  if (alreadyImported) {
    return { handled: true, imported: false, reason: "already_imported", matchId: alreadyImported.id };
  }

  if (isSourcePart1) {
    const isPart1 =
      !parsed.resultLine &&
      Boolean(parsed.title) &&
      Boolean(parsed.dateLine) &&
      (Boolean(parsed.timeLine) || parsed.mapLines.length > 0);

    if (!isPart1) return { handled: true, imported: false, reason: "invalid_part1" };

    const draft = await createMatchDraftFromPart1({ parsed, message });
    const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, draft.slug);
    console.log(`✅ Auto lettura parte 1 completata: ${draft.slug} -> ${webUrl}`);
    return { handled: true, imported: true, reason: "part1_imported", slug: draft.slug };
  }

  const isPart2 = Boolean(parsed.resultLine);
  if (!isPart2) return { handled: true, imported: false, reason: "invalid_part2" };

  const completed = await completeMatchFromPart2({ parsed, message });
  const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, completed.slug);
  console.log(`✅ Auto lettura parte 2 completata: ${completed.slug} -> ${webUrl}`);
  return { handled: true, imported: true, reason: "part2_imported", slug: completed.slug };
}

async function handleAutoMatchSourceDelete(message) {
  if (!message?.channelId || !message?.id) return false;

  const config = readConfig();
  const { sourceChannelPart1, sourceChannelPart2 } = getConfiguredMatchSourceChannels(config);
  const isSourcePart1 = sourceChannelPart1 && message.channelId === sourceChannelPart1;
  const isSourcePart2 = sourceChannelPart2 && message.channelId === sourceChannelPart2;

  if (!isSourcePart1 && !isSourcePart2) {
    return false;
  }

  const match = await findMatchBySourceMessage({
    part: isSourcePart2 ? 2 : 1,
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
  });

  if (!match) {
    return false;
  }

  if (isSourcePart1) {
    const hasPart2 = Boolean(match.source_message_id_part2);
    if (!hasPart2 && match.status === "draft") {
      await removeMatchById(match.id);
      console.log(`🗑️ Match bozza rimosso dal web dopo delete sorgente parte 1: ${match.slug}`);
      return true;
    }

    console.log(`ℹ️ Delete sorgente parte 1 ignorato per ${match.slug}: match già completato o collegato a parte 2`);
    return true;
  }

  console.log(`ℹ️ Delete sorgente parte 2 rilevato per ${match.slug}: nessuna rimozione automatica eseguita`);
  return true;
}

async function importMatchHistoryFromConfiguredSources(client, options = {}) {
  const config = readConfig();
  const configuredChannels = getConfiguredMatchSourceChannels(config);
  const sourceChannelPart1 = options.sourceChannelPart1 || configuredChannels.sourceChannelPart1 || "";
  const sourceChannelPart2 = options.sourceChannelPart2 || configuredChannels.sourceChannelPart2 || "";

  console.log("ℹ️ Avvio import storico match:", {
    sourceChannelPart1,
    sourceChannelPart2,
    sameChannel: Boolean(sourceChannelPart1) && sourceChannelPart1 === sourceChannelPart2,
  });

  const channels = [
    { type: "part1", id: sourceChannelPart1, before: options.part1Before || "" },
    { type: "part2", id: sourceChannelPart2, before: options.part2Before || "" },
  ].filter(item => item.id);
  const maxMessagesPerChannel = Number(options.maxMessagesPerChannel || 40);

  const summary = {
    limitPerChannel: null,
    scanned: 0,
    imported: 0,
    duplicates: 0,
      skipped: 0,
      failed: 0,
      failedMatches: [],
      skippedMessages: [],
      progress: {},
      channels: [],
  };

  for (const source of channels) {
    const channel = await client.channels.fetch(source.id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      summary.channels.push({
        type: source.type,
        channelId: source.id,
        scanned: 0,
        imported: 0,
        duplicates: 0,
        skipped: 0,
        error: "channel_not_found",
      });
      continue;
    }

    const channelStats = {
      type: source.type,
      channelId: source.id,
      scanned: 0,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      failed: 0,
      skipReasons: {},
      skippedMessages: [],
      error: "",
    };

    await processChannelHistoryInBatches({
      channel,
      source,
      client,
      channelStats,
      summary,
      maxMessagesPerChannel,
    });

    summary.scanned += channelStats.scanned;
    summary.imported += channelStats.imported;
    summary.duplicates += channelStats.duplicates;
    summary.skipped += channelStats.skipped;
    summary.failed += channelStats.failed;
    summary.channels.push(channelStats);
    summary.progress[source.type] = {
      before: channelStats.nextBefore || "",
      completed: Boolean(channelStats.completed),
    };
  }

  console.log(
    "ℹ️ Riepilogo import storico match:",
    JSON.stringify(
      {
        scanned: summary.scanned,
        imported: summary.imported,
        duplicates: summary.duplicates,
        skipped: summary.skipped,
        failed: summary.failed,
        channels: summary.channels.map(channel => ({
          type: channel.type,
          channelId: channel.channelId,
          scanned: channel.scanned,
          imported: channel.imported,
          duplicates: channel.duplicates,
          skipped: channel.skipped,
          failed: channel.failed || 0,
          skipReasons: channel.skipReasons || {},
          error: channel.error || "",
        })),
        skippedMessages: summary.skippedMessages,
      },
      null,
      2
    )
  );

  return summary;
}

async function processChannelHistoryInBatches({
  channel,
  source,
  client,
  channelStats,
  summary,
  maxMessagesPerChannel,
}) {
  let before = source.before || "";
  let processedInRun = 0;

  while (true) {
    if (processedInRun >= maxMessagesPerChannel) {
      channelStats.nextBefore = before || "";
      channelStats.completed = false;
      break;
    }

    const batchSize = 25;
    const currentLimit = Math.min(batchSize, maxMessagesPerChannel - processedInRun);
    const batch = await channel.messages.fetch(
      before
        ? { limit: currentLimit, before, cache: false }
        : { limit: currentLimit, cache: false }
    );

    if (!batch.size) {
      channelStats.nextBefore = "";
      channelStats.completed = true;
      break;
    }

    const messages = [...batch.values()].reverse();
    processedInRun += messages.length;

    for (const message of messages) {
      channelStats.scanned += 1;

      try {
        const result = await handleAutoMatchSourceMessage(message, client);
        if (!result.handled) continue;

        if (result.imported) {
          channelStats.imported += 1;
        } else if (result.reason === "already_imported") {
          channelStats.duplicates += 1;
        } else {
          channelStats.skipped += 1;
          channelStats.skipReasons[result.reason] =
            (channelStats.skipReasons[result.reason] || 0) + 1;
          collectSkippedMessage({
            summary,
            channelStats,
            source,
            message,
            reason: result.reason,
          });
        }
      } catch (error) {
        channelStats.failed += 1;

        const parsed = parseMatchMessage(message);
        const failure = {
          channelType: source.type,
          channelId: source.id,
          messageId: message.id,
          title: parsed.title || "",
          dateLine: parsed.dateLine || "",
          resultLine: parsed.resultLine || "",
          error: error.message || String(error),
        };

        if (summary.failedMatches.length < 25) {
          summary.failedMatches.push(failure);
        }

        console.error(
          `❌ Errore import storico ${source.type} ${message.id}:`,
          failure.error
        );
      }
    }

    const rawMessages = [...batch.values()];
    before = rawMessages[rawMessages.length - 1].id;
    channelStats.nextBefore = before;

    if (channel.messages?.cache?.size) {
      channel.messages.cache.clear();
    }

    if (batch.size < currentLimit) {
      channelStats.nextBefore = "";
      channelStats.completed = true;
      break;
    }

    // Batch piccoli e pausa un po' più lunga per non saturare memoria/cache del processo.
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

function collectSkippedMessage({ summary, channelStats, source, message, reason }) {
  const preview = extractRawText(message)
    .split("\n")
    .map(line => String(line || "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ")
    .slice(0, 220);

  const entry = {
    channelType: source.type,
    channelId: source.id,
    messageId: message.id,
    reason,
    createdAt: message.createdAt ? message.createdAt.toISOString() : "",
    preview,
  };

  if (channelStats.skippedMessages.length < 10) {
    channelStats.skippedMessages.push(entry);
  }

  if (summary.skippedMessages.length < 20) {
    summary.skippedMessages.push(entry);
  }
}

function startAutoMatchImportWorker(client) {
  if (historyImportTimer) return;
  scheduleNextHistoryImportTick(client, 10 * 1000);
}

function scheduleNextHistoryImportTick(client, delayMs = MATCH_IMPORT_TICK_MS) {
  if (historyImportTimer) {
    clearTimeout(historyImportTimer);
  }

  historyImportTimer = setTimeout(async () => {
    historyImportTimer = null;
    await runAutoMatchImportTick(client);
  }, delayMs);

  historyImportTimer.unref?.();
}

async function runAutoMatchImportTick(client) {
  if (historyImportRunning) {
    scheduleNextHistoryImportTick(client, MATCH_IMPORT_TICK_MS);
    return;
  }

  historyImportRunning = true;

  try {
    const config = readConfig();
    const { sourceChannelPart1, sourceChannelPart2 } = getConfiguredMatchSourceChannels(config);

    if (!sourceChannelPart1 || !sourceChannelPart2) {
      console.log("ℹ️ Import match automatico in attesa: canali Parte 1/Parte 2 non configurati");
      return;
    }

    const currentState = config.matchImportState || {};
    const requiresRebuild =
      currentState.version !== MATCH_IMPORT_STATE_VERSION ||
      currentState.sourceChannelPart1 !== sourceChannelPart1 ||
      currentState.sourceChannelPart2 !== sourceChannelPart2;

    if (requiresRebuild) {
      console.log("ℹ️ Import match automatico: nuova sessione di rebuild avviata");
      await removeAllMatches();
      setMatchImportState({
        version: MATCH_IMPORT_STATE_VERSION,
        sourceChannelPart1,
        sourceChannelPart2,
        part1Before: "",
        part2Before: "",
        completed: false,
      });
    } else if (currentState.completed) {
      return;
    }

    const effectiveState = requiresRebuild
      ? {
          sourceChannelPart1,
          sourceChannelPart2,
          part1Before: "",
          part2Before: "",
          completed: false,
        }
      : currentState;

    const summary = await importMatchHistoryFromConfiguredSources(client, {
      sourceChannelPart1,
      sourceChannelPart2,
      part1Before: effectiveState.part1Before || "",
      part2Before: effectiveState.part2Before || "",
      maxMessagesPerChannel: MATCH_IMPORT_MAX_MESSAGES_PER_CHANNEL,
    });

    const nextState = {
      version: MATCH_IMPORT_STATE_VERSION,
      sourceChannelPart1,
      sourceChannelPart2,
      part1Before: summary.progress?.part1?.before || "",
      part2Before: summary.progress?.part2?.before || "",
      completed:
        Boolean(summary.progress?.part1?.completed) &&
        Boolean(summary.progress?.part2?.completed),
    };

    setMatchImportState(nextState);

    console.log("ℹ️ Tick import match automatico completato:", {
      scanned: summary.scanned,
      imported: summary.imported,
      skipped: summary.skipped,
      failed: summary.failed,
      completed: nextState.completed,
      part1Before: nextState.part1Before || "done",
      part2Before: nextState.part2Before || "done",
    });
  } catch (error) {
    console.error("❌ Errore import match automatico:", error);
  } finally {
    historyImportRunning = false;
    scheduleNextHistoryImportTick(
      client,
      readConfig().matchImportState?.completed ? 5 * 60 * 1000 : MATCH_IMPORT_TICK_MS
    );
  }
}

module.exports = {
  handleAutoMatchSourceMessage,
  handleAutoMatchSourceDelete,
  importMatchHistoryFromConfiguredSources,
  startAutoMatchImportWorker,
};
