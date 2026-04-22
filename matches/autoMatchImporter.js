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
  if (!message || !client) return false;
  if (!message.guildId || !message.channelId) return false;
  if (message.author?.bot) return false;

  const config = readConfig();
  const isSourcePart1 = config.sourceChannelPart1 && message.channelId === config.sourceChannelPart1;
  const isSourcePart2 = config.sourceChannelPart2 && message.channelId === config.sourceChannelPart2;

  if (!isSourcePart1 && !isSourcePart2) {
    return false;
  }

  const parsed = parseMatchMessage(message.content || "");
  if (!parsed.title || !parsed.dateLine) {
    return false;
  }

  const alreadyImported = await findMatchBySourceMessage({
    part: isSourcePart2 ? 2 : 1,
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
  });

  if (alreadyImported) {
    return true;
  }

  const destinationChannelId = isSourcePart2 ? config.targetChannel2 : config.targetChannel1;
  const destinationChannel = destinationChannelId
    ? await client.channels.fetch(destinationChannelId).catch(() => null)
    : null;

  if (!destinationChannel || destinationChannel.type !== ChannelType.GuildText) {
    console.log(`⚠️ Auto import match saltato: canale destinazione non configurato per ${isSourcePart2 ? "parte 2" : "parte 1"}`);
    return false;
  }

  if (isSourcePart1) {
    const isPart1 =
      !parsed.resultLine &&
      Boolean(parsed.title) &&
      Boolean(parsed.dateLine) &&
      (Boolean(parsed.timeLine) || parsed.mapLines.length > 0);

    if (!isPart1) return false;

    await destinationChannel.send({
      content: buildPart1Message(parsed),
    });

    const draft = await createMatchDraftFromPart1({ parsed, message });
    const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, draft.slug);
    console.log(`✅ Auto import parte 1 completato: ${draft.slug} -> ${webUrl}`);
    return true;
  }

  const isPart2 = Boolean(parsed.resultLine);
  if (!isPart2) return false;

  await destinationChannel.send({
    content: buildPart2Message(parsed),
    files: getImageAttachments(message).slice(0, 10).map(attachment => attachment.url),
  });

  const completed = await completeMatchFromPart2({ parsed, message });
  const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, completed.slug);
  console.log(`✅ Auto import parte 2 completato: ${completed.slug} -> ${webUrl}`);
  return true;
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

module.exports = {
  handleAutoMatchSourceMessage,
  handleAutoMatchSourceDelete,
};
