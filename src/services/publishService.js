const { AttachmentBuilder } = require("discord.js");

const SEPARATOR_PATH = process.env.SEPARATOR_PATH || "./separator.png";

function buildPart1Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.timeLine) lines.push(`• ${data.timeLine}`);

  if (data.mapLines.length > 0) {
    lines.push("");
    for (const map of data.mapLines) lines.push(map);
  }

  lines.push("");
  return lines.join("\n");
}

function buildPart2Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.resultLine) lines.push(`• ${data.resultLine}`);

  return lines.join("\n");
}

function buildPart2Draft(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  lines.push("• Result:");

  return lines.join("\n");
}

function getImageAttachments(message) {
  return [...message.attachments.values()].filter(attachment =>
    attachment.contentType?.startsWith("image/")
  );
}

async function sendSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(SEPARATOR_PATH)],
  });
}

async function sendPart1Inline(channel, text) {
  await channel.send({
    content: text.endsWith("\n") ? text : `${text}\n`,
    files: [new AttachmentBuilder(SEPARATOR_PATH)],
  });
}

async function publishMatch({ parsed, channels, imageAttachments }) {
  const published = [];
  const hasPart1 = Boolean(parsed.timeLine) || parsed.mapLines.length > 0;
  const hasPart2 = Boolean(parsed.resultLine);

  if (!hasPart1 && !hasPart2) {
    throw new Error("Non ho trovato una parte valida nel messaggio selezionato.");
  }

  if (hasPart1) {
    if (!channels.part1) {
      throw new Error("Canale parte 1 non configurato correttamente.");
    }

    await sendPart1Inline(channels.part1, buildPart1Message(parsed));
    published.push("parte 1");
  }

  if (hasPart2) {
    if (!channels.part2) {
      throw new Error("Canale parte 2 non configurato correttamente.");
    }

    await channels.part2.send({
      content: buildPart2Message(parsed),
      files: imageAttachments.slice(0, 10).map(file => file.url),
    });

    await sendSeparator(channels.part2);
    published.push("parte 2");
  }

  return { published };
}

module.exports = {
  buildPart1Message,
  buildPart2Message,
  buildPart2Draft,
  getImageAttachments,
  sendSeparator,
  sendPart1Inline,
  publishMatch,
};