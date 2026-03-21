require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ChannelType,
} = require("discord.js");
const { startScheduler } = require("./scheduler");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const CHANNEL_IDS = [
  "1483903818709340348",
  "1428766410170957895",
];

const TARGET_CHANNEL_1 = process.env.TARGET_CHANNEL_1;
const TARGET_CHANNEL_2 = process.env.TARGET_CHANNEL_2;
const SEPARATOR_PATH = process.env.SEPARATOR_PATH || "./separator.png";

function normalizeLine(text) {
  return text.replace(/^[•>\-\s]+/, "").replace(/\s+/g, " ").trim();
}

function isDateLine(line) {
  return /(lun|mar|mer|gio|ven|sab|dom|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i.test(
    normalizeLine(line)
  );
}

function isTimeLine(line) {
  return /^\d{1,2}:\d{2}$/.test(normalizeLine(line));
}

function isResultLine(line) {
  return /^results?\s*:/i.test(normalizeLine(line));
}

function isMapLine(line) {
  const parts = normalizeLine(line).split("/").map((p) => p.trim());
  return parts.length === 3;
}

function cleanResult(line) {
  return normalizeLine(line).replace(/^results?/i, "Result");
}

function parseMatchMessage(content) {
  const lines = (content || "")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  let title = "";
  let dateLine = "";
  let timeLine = "";
  let resultLine = "";
  const mapLines = [];

  for (const line of lines) {
    if (!title && /\bvs\b/i.test(line)) {
      title = line;
      continue;
    }

    if (!dateLine && isDateLine(line)) {
      dateLine = line;
      continue;
    }

    if (!timeLine && isTimeLine(line)) {
      timeLine = line;
      continue;
    }

    if (!resultLine && isResultLine(line)) {
      resultLine = cleanResult(line);
      continue;
    }

    if (isMapLine(line)) {
      mapLines.push(line);
    }
  }

  return { title, dateLine, timeLine, resultLine, mapLines };
}

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
  return [...message.attachments.values()].filter((att) =>
    att.contentType?.startsWith("image/")
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

client.once(Events.ClientReady, () => {
  console.log(`✅ Loggato come ${client.user.tag}`);
  startScheduler(client, CHANNEL_IDS);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isMessageContextMenuCommand()) return;

  let deferred = false;

  try {
    if (
      interaction.commandName !== "Prepara Parte 2" &&
      interaction.commandName !== "Pubblica Match"
    ) {
      return;
    }

    await interaction.deferReply({ flags: 64 });
    deferred = true;

    const msg = interaction.targetMessage;
    const parsed = parseMatchMessage(msg.content || "");

    if (interaction.commandName === "Prepara Parte 2") {
      if (!parsed.title && !parsed.dateLine) {
        await interaction.editReply({
          content: "❌ Non sono riuscito a ricavare titolo e data da questo messaggio.",
        });
        return;
      }

      await interaction.editReply({
        content: buildPart2Draft(parsed),
      });
      return;
    }

    const images = getImageAttachments(msg);
    const hasPart1 = Boolean(parsed.timeLine) || parsed.mapLines.length > 0;
    const hasPart2 = Boolean(parsed.resultLine);

    const ch1 = await client.channels.fetch(TARGET_CHANNEL_1);
    const ch2 = await client.channels.fetch(TARGET_CHANNEL_2);

    if (!ch1 || !ch2) {
      await interaction.editReply({
        content: "❌ Non trovo uno dei canali di destinazione.",
      });
      return;
    }

    if (
      ch1.type !== ChannelType.GuildText ||
      ch2.type !== ChannelType.GuildText
    ) {
      await interaction.editReply({
        content: "❌ Uno dei canali di destinazione non è un canale testuale.",
      });
      return;
    }

    if (!hasPart1 && !hasPart2) {
      await interaction.editReply({
        content: "❌ Non ho trovato una parte valida nel messaggio selezionato.",
      });
      return;
    }

    if (hasPart1) {
      await sendPart1Inline(ch1, buildPart1Message(parsed));
    }

    if (hasPart2) {
      await ch2.send({
        content: buildPart2Message(parsed),
        files: images.slice(0, 10).map((a) => a.url),
      });

      await sendSeparator(ch2);
    }

    await interaction.editReply({
      content: "✅ Pubblicato correttamente",
    });
  } catch (err) {
    console.error("❌ Errore interaction:", err);

    if (!deferred) return;

    try {
      await interaction.editReply({
        content: "❌ Errore durante l'esecuzione del comando.",
      });
    } catch (replyErr) {
      console.error("❌ Errore anche nella editReply:", replyErr);
    }
  }
});

client.login(process.env.TOKEN);