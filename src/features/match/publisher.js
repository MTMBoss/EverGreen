const { AttachmentBuilder, ChannelType } = require('discord.js');
const { APP_CONFIG } = require('../../config');
const {
  buildPart1Message,
  buildPart2Message,
  buildPart2Draft,
} = require('./formatter');

function getImageAttachments(message) {
  return [...message.attachments.values()].filter(att => att.contentType?.startsWith('image/'));
}

async function sendSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(APP_CONFIG.separatorPath)],
  });
}

async function sendPart1Inline(channel, text) {
  await channel.send({
    content: text.endsWith('\n') ? text : `${text}\n`,
    files: [new AttachmentBuilder(APP_CONFIG.separatorPath)],
  });
}

async function publishMatch({ client, config, parsed, sourceMessage }) {
  const images = getImageAttachments(sourceMessage);
  const hasPart1 = Boolean(parsed.timeLine) || parsed.mapLines.length > 0;
  const hasPart2 = Boolean(parsed.resultLine);

  if (!hasPart1 && !hasPart2) {
    throw new Error('NO_VALID_PART');
  }

  const ch1 = config.targetChannel1 ? await client.channels.fetch(config.targetChannel1) : null;
  const ch2 = config.targetChannel2 ? await client.channels.fetch(config.targetChannel2) : null;

  if (hasPart1) {
    if (!ch1 || ch1.type !== ChannelType.GuildText) {
      throw new Error('PART1_CHANNEL_INVALID');
    }
    await sendPart1Inline(ch1, buildPart1Message(parsed));
  }

  if (hasPart2) {
    if (!ch2 || ch2.type !== ChannelType.GuildText) {
      throw new Error('PART2_CHANNEL_INVALID');
    }
    await ch2.send({
      content: buildPart2Message(parsed),
      files: images.slice(0, 10).map(a => a.url),
    });
    await sendSeparator(ch2);
  }
}

module.exports = {
  publishMatch,
  buildPart2Draft,
};
