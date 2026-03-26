require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ChannelType,
} = require("discord.js");

const { startScheduler } = require("./scheduler");
const {
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require("./configStore");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

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
  const parts = normalizeLine(line).split("/").map(p => p.trim());
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
if (interaction.commandName === "set-canale-annuncio-schedule") {
  const channel = interaction.options.getChannel("canale", true);
  setScheduleAnnouncementChannel(channel.id);

  await interaction.editReply({
    content: `✅ Canale annuncio schedule impostato su ${channel}.`,
  });
  return;
}

if (interaction.commandName === "set-ruoli-schedule") {
  const requiredRole = interaction.options.getRole("ruolo_obbligatorio", true);
  const optionalRole = interaction.options.getRole("ruolo_opzionale", false);

  setRequiredRoleId(requiredRole.id);
  setOptionalRoleId(optionalRole ? optionalRole.id : "");

  await interaction.editReply({
    content:
      `✅ Ruoli aggiornati:\n` +
      `Obbligatorio: <@&${requiredRole.id}>\n` +
      `Opzionale: ${optionalRole ? `<@&${optionalRole.id}>` : "nessuno"}`,
  });
  return;
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
  return [...message.attachments.values()].filter(att =>
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
  startScheduler(client);
});

client.on(Events.InteractionCreate, async interaction => {
  let deferred = false;

  try {
    if (interaction.isMessageContextMenuCommand()) {
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
        await interaction.editReply({
          content: buildPart2Draft(parsed),
        });
        return;
      }

      const config = readConfig();
      const images = getImageAttachments(msg);
      const hasPart1 = Boolean(parsed.timeLine) || parsed.mapLines.length > 0;
      const hasPart2 = Boolean(parsed.resultLine);

      const ch1 = config.targetChannel1
        ? await client.channels.fetch(config.targetChannel1)
        : null;

      const ch2 = config.targetChannel2
        ? await client.channels.fetch(config.targetChannel2)
        : null;

      if (!hasPart1 && !hasPart2) {
        await interaction.editReply({
          content: "❌ Non ho trovato una parte valida nel messaggio selezionato.",
        });
        return;
      }

      if (hasPart1) {
        if (!ch1 || ch1.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "❌ Canale parte 1 non configurato correttamente.",
          });
          return;
        }

        await sendPart1Inline(ch1, buildPart1Message(parsed));
      }

      if (hasPart2) {
        if (!ch2 || ch2.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "❌ Canale parte 2 non configurato correttamente.",
          });
          return;
        }

        await ch2.send({
          content: buildPart2Message(parsed),
          files: images.slice(0, 10).map(a => a.url),
        });

        await sendSeparator(ch2);
      }

      await interaction.editReply({
        content: "✅ Pubblicato",
      });
      return;
    }

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ flags: 64 });
      deferred = true;

      if (interaction.commandName === "set-canale-parte1") {
        const channel = interaction.options.getChannel("canale", true);
        setTargetChannel1(channel.id);

        await interaction.editReply({
          content: `✅ Canale parte 1 impostato su ${channel}.`,
        });
        return;
      }

      if (interaction.commandName === "set-canale-parte2") {
        const channel = interaction.options.getChannel("canale", true);
        setTargetChannel2(channel.id);

        await interaction.editReply({
          content: `✅ Canale parte 2 impostato su ${channel}.`,
        });
        return;
      }

      if (interaction.commandName === "set-canali-schedule") {
        const channel1 = interaction.options.getChannel("canale1", true);
        const channel2 = interaction.options.getChannel("canale2", false);

        const ids = [channel1.id];
        if (channel2) ids.push(channel2.id);

        setScheduleChannels(ids);

        await interaction.editReply({
          content: `✅ Canali schedule aggiornati: ${ids.map(id => `<#${id}>`).join(", ")}`,
        });
        return;
      }

      if (interaction.commandName === "mostra-config") {
        const config = readConfig();

        await interaction.editReply({
          content:
            `**Configurazione attuale**\n` +
            `Parte 1: ${config.targetChannel1 ? `<#${config.targetChannel1}>` : "non impostato"}\n` +
            `Parte 2: ${config.targetChannel2 ? `<#${config.targetChannel2}>` : "non impostato"}\n` +
            `Annuncio schedule: ${config.scheduleAnnouncementChannel ? `<#${config.scheduleAnnouncementChannel}>` : "non impostato"}\n` +
`Ruolo obbligatorio: ${config.requiredRoleId ? `<@&${config.requiredRoleId}>` : "non impostato"}\n` +
`Ruolo opzionale: ${config.optionalRoleId ? `<@&${config.optionalRoleId}>` : "non impostato"}`
        });
        return;
      }
    }
  } catch (err) {
    console.error("❌ Errore:", err);

    if (!deferred) return;

    try {
      await interaction.editReply({
        content: "❌ Errore durante il comando.",
      });
    } catch {}
  }
});

client.login(process.env.TOKEN);