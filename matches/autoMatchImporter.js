const { ChannelType } = require("discord.js");

const { readConfig } = require("../config/configStore");
const {
  parseMatchMessage,
} = require("./matchMessageParser");
const {
  createMatchDraftFromPart1,
  completeMatchFromPart2,
  buildMatchWebUrl,
  removeMatchById,
} = require("./matchService");
const { findMatchBySourceMessage } = require("./matchRepository");

async function handleAutoMatchSourceMessage(message, client) {
  if (!message || !client) return { handled: false, imported: false, reason: "missing_context" };
  if (!message.guildId || !message.channelId) return { handled: false, imported: false, reason: "missing_channel" };
  if (message.author?.bot) return { handled: false, imported: false, reason: "bot_message" };

  const config = readConfig();
  const isSourcePart1 = config.sourceChannelPart1 && message.channelId === config.sourceChannelPart1;
  const isSourcePart2 = config.sourceChannelPart2 && message.channelId === config.sourceChannelPart2;

  if (!isSourcePart1 && !isSourcePart2) {
    return { handled: false, imported: false, reason: "not_source_channel" };
  }

  const parsed = parseMatchMessage(message.content || "");
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
  const isSourcePart1 = config.sourceChannelPart1 && message.channelId === config.sourceChannelPart1;
  const isSourcePart2 = config.sourceChannelPart2 && message.channelId === config.sourceChannelPart2;

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
  const sourceChannelPart1 = options.sourceChannelPart1 || config.sourceChannelPart1 || "";
  const sourceChannelPart2 = options.sourceChannelPart2 || config.sourceChannelPart2 || "";

  const channels = [
    { type: "part1", id: sourceChannelPart1 },
    { type: "part2", id: sourceChannelPart2 },
  ].filter(item => item.id);

  const summary = {
    limitPerChannel: null,
    scanned: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
    failedMatches: [],
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
      error: "",
    };

    await processChannelHistoryInBatches({
      channel,
      source,
      client,
      channelStats,
      summary,
    });

    summary.scanned += channelStats.scanned;
    summary.imported += channelStats.imported;
    summary.duplicates += channelStats.duplicates;
    summary.skipped += channelStats.skipped;
    summary.failed += channelStats.failed;
    summary.channels.push(channelStats);
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
          error: channel.error || "",
        })),
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
}) {
  let before;

  while (true) {
    const batchSize = 100;
    const batch = await channel.messages.fetch(
      before
        ? { limit: batchSize, before }
        : { limit: batchSize }
    );

    if (!batch.size) break;

    const messages = [...batch.values()]
      .filter(message => !message.author?.bot)
      .reverse();

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
        }
      } catch (error) {
        channelStats.failed += 1;

        const parsed = parseMatchMessage(message.content || "");
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

    if (batch.size < batchSize) break;

    // Piccola pausa per alleggerire memoria e rate limit durante import lunghi.
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

module.exports = {
  handleAutoMatchSourceMessage,
  handleAutoMatchSourceDelete,
  importMatchHistoryFromConfiguredSources,
};
