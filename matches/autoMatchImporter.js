const { ChannelType } = require("discord.js");

const { readConfig } = require("../config/configStore");
const {
  buildPart1Message,
  buildPart2Message,
  getImageAttachments,
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

  const destinationChannelId = isSourcePart2 ? config.targetChannel2 : config.targetChannel1;
  const destinationChannel = destinationChannelId
    ? await client.channels.fetch(destinationChannelId).catch(() => null)
    : null;

  if (!destinationChannel || destinationChannel.type !== ChannelType.GuildText) {
    console.log(`⚠️ Auto import match saltato: canale destinazione non configurato per ${isSourcePart2 ? "parte 2" : "parte 1"}`);
    return { handled: true, imported: false, reason: "missing_destination_channel" };
  }

  if (isSourcePart1) {
    const isPart1 =
      !parsed.resultLine &&
      Boolean(parsed.title) &&
      Boolean(parsed.dateLine) &&
      (Boolean(parsed.timeLine) || parsed.mapLines.length > 0);

    if (!isPart1) return { handled: true, imported: false, reason: "invalid_part1" };

    await destinationChannel.send({
      content: buildPart1Message(parsed),
    });

    const draft = await createMatchDraftFromPart1({ parsed, message });
    const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, draft.slug);
    console.log(`✅ Auto import parte 1 completato: ${draft.slug} -> ${webUrl}`);
    return { handled: true, imported: true, reason: "part1_imported", slug: draft.slug };
  }

  const isPart2 = Boolean(parsed.resultLine);
  if (!isPart2) return { handled: true, imported: false, reason: "invalid_part2" };

  await destinationChannel.send({
    content: buildPart2Message(parsed),
    files: getImageAttachments(message).slice(0, 10).map(attachment => attachment.url),
  });

  const completed = await completeMatchFromPart2({ parsed, message });
  const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, completed.slug);
  console.log(`✅ Auto import parte 2 completato: ${completed.slug} -> ${webUrl}`);
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
  const limitPerChannel = Math.max(1, Math.min(Number(options.limitPerChannel || 100), 1000));
  const config = readConfig();

  const channels = [
    { type: "part1", id: config.sourceChannelPart1 || "" },
    { type: "part2", id: config.sourceChannelPart2 || "" },
  ].filter(item => item.id);

  const summary = {
    limitPerChannel,
    scanned: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
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

    const messages = await fetchRecentMessages(channel, limitPerChannel);
    const orderedMessages = messages
      .filter(message => !message.author?.bot)
      .sort((left, right) => left.createdTimestamp - right.createdTimestamp);

    const channelStats = {
      type: source.type,
      channelId: source.id,
      scanned: orderedMessages.length,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      error: "",
    };

    for (const message of orderedMessages) {
      const result = await handleAutoMatchSourceMessage(message, client);
      if (!result.handled) continue;

      if (result.imported) {
        channelStats.imported += 1;
      } else if (result.reason === "already_imported") {
        channelStats.duplicates += 1;
      } else {
        channelStats.skipped += 1;
      }
    }

    summary.scanned += channelStats.scanned;
    summary.imported += channelStats.imported;
    summary.duplicates += channelStats.duplicates;
    summary.skipped += channelStats.skipped;
    summary.channels.push(channelStats);
  }

  return summary;
}

async function fetchRecentMessages(channel, limit) {
  const collected = [];
  let before;

  while (collected.length < limit) {
    const batchSize = Math.min(100, limit - collected.length);
    const batch = await channel.messages.fetch(
      before
        ? { limit: batchSize, before }
        : { limit: batchSize }
    );

    if (!batch.size) break;

    const messages = [...batch.values()];
    collected.push(...messages);
    before = messages[messages.length - 1].id;

    if (batch.size < batchSize) break;
  }

  return collected;
}

module.exports = {
  handleAutoMatchSourceMessage,
  handleAutoMatchSourceDelete,
  importMatchHistoryFromConfiguredSources,
};
