require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ChannelType,
  Partials,
} = require("discord.js");

const { startScheduler } = require("./scheduler");
const {
  initializeConfigStore,
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setPngChannel,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require("./configStore");

const {
  extractMatchDate,
  getSeparatorActions,
  commitSeparatorState,
} = require("./publicationTracker");

const { renderMatchImage } = require("./matchImageRenderer");
const {
  handleMessageCreate,
  handleMessageUpdate,
  handleMessageDelete,
} = require("./channelLogger");
const {
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleMemberRoleChanges,
} = require("./roleLogger");
const {
  initializeAttendance,
} = require("./attendance/attendanceService");
const {
  handleAttendanceSlashCommand,
  handleAttendanceComponent,
  isAttendanceCommand,
} = require("./attendance/attendanceDiscord");
const {
  startAttendanceReminderScheduler,
  startAttendanceRosterSyncScheduler,
} = require("./attendance/attendanceScheduler");
const { scheduleRosterSync } = require("./attendance/rosterAutoSync");
const { startAttendanceWebServer } = require("./web/server");

initializeAttendance();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const WEEK_SEPARATOR_PATH =
  process.env.WEEK_SEPARATOR_PATH || "./separator-week.png";
const MONTH_SEPARATOR_PATH =
  process.env.MONTH_SEPARATOR_PATH || "./separator-month.png";
const DEFAULT_SEPARATOR_PATH =
  process.env.DEFAULT_SEPARATOR_PATH || "./separator.png";

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

async function sendWeekSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(WEEK_SEPARATOR_PATH)],
  });
}

async function sendMonthSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(MONTH_SEPARATOR_PATH)],
  });
}

async function sendDefaultSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(DEFAULT_SEPARATOR_PATH)],
  });
}

async function ensureDateSeparators(channel, dateLine) {
  const matchDate = extractMatchDate(dateLine);

  if (!matchDate) return false;

  const actions = getSeparatorActions(channel.id, matchDate);

  if (actions.monthChanged) {
    await sendMonthSeparator(channel);
    await sendWeekSeparator(channel);
  } else if (actions.weekChanged) {
    await sendWeekSeparator(channel);
  }

  commitSeparatorState(channel.id, matchDate);
  return true;
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Loggato come ${client.user.tag}`);
  startScheduler(client);
  startAttendanceReminderScheduler(client);
  startAttendanceRosterSyncScheduler(client);
  startAttendanceWebServer(client);

  for (const guild of client.guilds.cache.values()) {
    scheduleRosterSync(guild, "startup_initial_sync", 3000);
  }
});

client.on(Events.GuildMemberAdd, member => {
  scheduleRosterSync(member.guild, "member_add");
});

client.on(Events.GuildMemberRemove, member => {
  scheduleRosterSync(member.guild, "member_remove");
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const config = readConfig();
    const trackedRoleIds = config.attendanceRoleIds || [];

    await handleMemberRoleChanges(oldMember, newMember);

    if (trackedRoleIds.length === 0) return;

    const oldTracked = trackedRoleIds.some(roleId => oldMember.roles.cache.has(roleId));
    const newTracked = trackedRoleIds.some(roleId => newMember.roles.cache.has(roleId));

    const nicknameChanged =
      (oldMember.nickname || "") !== (newMember.nickname || "");

    const displayNameChanged =
      (oldMember.displayName || "") !== (newMember.displayName || "");

    if (oldTracked !== newTracked || nicknameChanged || displayNameChanged) {
      scheduleRosterSync(newMember.guild, "member_update");
    }
  } catch (error) {
    console.error("❌ Errore GuildMemberUpdate roster sync:", error);
  }
});

client.on(Events.GuildRoleCreate, async role => {
  try {
    await handleRoleCreate(role);
  } catch (error) {
    console.error("❌ Errore logger roleCreate:", error);
  }
});

client.on(Events.GuildRoleDelete, async role => {
  try {
    await handleRoleDelete(role);
  } catch (error) {
    console.error("❌ Errore logger roleDelete:", error);
  }
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  try {
    await handleRoleUpdate(oldRole, newRole);
  } catch (error) {
    console.error("❌ Errore logger roleUpdate:", error);
  }
});

client.on(Events.MessageCreate, async message => {
  try {
    await handleMessageCreate(message);
  } catch (error) {
    console.error("❌ Errore logger messageCreate:", error);
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  try {
    await handleMessageUpdate(oldMessage, newMessage);
  } catch (error) {
    console.error("❌ Errore logger messageUpdate:", error);
  }
});

client.on(Events.MessageDelete, async message => {
  try {
    await handleMessageDelete(message);
  } catch (error) {
    console.error("❌ Errore logger messageDelete:", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  let deferred = false;

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const handled = await handleAttendanceComponent(interaction);
    if (handled) return;
  }

  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const handled = await handleAttendanceComponent(interaction);
      if (handled) return;
    }
    if (interaction.isMessageContextMenuCommand()) {
      if (
        interaction.commandName !== "Prepara Parte 2" &&
        interaction.commandName !== "Pubblica Match" &&
        interaction.commandName !== "Pubblica PNG"
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

      if (interaction.commandName === "Pubblica PNG") {
        const config = readConfig();
        const pngChannel = config.pngChannel
          ? await client.channels.fetch(config.pngChannel)
          : null;

        if (!pngChannel || pngChannel.type !== ChannelType.GuildText) {
          await interaction.editReply({
            content: "❌ Canale PNG non configurato correttamente.",
          });
          return;
        }

        if (
          !parsed.title ||
          !parsed.dateLine ||
          !parsed.timeLine ||
          parsed.mapLines.length === 0
        ) {
          await interaction.editReply({
            content: "❌ Il messaggio non contiene dati sufficienti per generare il PNG.",
          });
          return;
        }

        await ensureDateSeparators(pngChannel, parsed.dateLine);

        const imageBuffer = await renderMatchImage(parsed);

        await pngChannel.send({
          files: [
            new AttachmentBuilder(imageBuffer, {
              name: "match.png",
            }),
          ],
        });

        await interaction.editReply({
          content: `✅ PNG pubblicato in ${pngChannel}.`,
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

        await ch1.send({
          content: buildPart1Message(parsed),
        });

        await sendDefaultSeparator(ch1);
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

        await sendDefaultSeparator(ch2);
      }

      await interaction.editReply({
        content: "✅ Pubblicato",
      });
      return;
    }

    if (interaction.isChatInputCommand()) {
      const isPublicLeaderboard =
        interaction.commandName === "leaderboard-presenze";

      if (isPublicLeaderboard) {
        await interaction.deferReply();
      } else {
        await interaction.deferReply({ flags: 64 });
      }

      deferred = true;

      if (isAttendanceCommand(interaction.commandName)) {
        await handleAttendanceSlashCommand(interaction, client);
        return;
      }

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

      if (interaction.commandName === "set-canale-png") {
        const channel = interaction.options.getChannel("canale", true);
        setPngChannel(channel.id);

        await interaction.editReply({
          content: `✅ Canale PNG impostato su ${channel}.`,
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
          content: `✅ Canali schedule aggiornati: ${ids
            .map(id => `<#${id}>`)
            .join(", ")}`,
        });
        return;
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
        const requiredRole = interaction.options.getRole(
          "ruolo_obbligatorio",
          true
        );
        const optionalRole = interaction.options.getRole(
          "ruolo_opzionale",
          false
        );

        setRequiredRoleId(requiredRole.id);
        setOptionalRoleId(optionalRole ? optionalRole.id : "");

        await interaction.editReply({
          content:
            `✅ Ruoli schedule aggiornati:\n` +
            `Obbligatorio: <@&${requiredRole.id}>\n` +
            `Opzionale: ${optionalRole ? `<@&${optionalRole.id}>` : "nessuno"}`,
        });
        return;
      }

      if (interaction.commandName === "mostra-config") {
        const config = readConfig();

        await interaction.editReply({
          content:
            `**Configurazione attuale**\n` +
            `Parte 1: ${config.targetChannel1
              ? `<#${config.targetChannel1}>`
              : "non impostato"
            }\n` +
            `Parte 2: ${config.targetChannel2
              ? `<#${config.targetChannel2}>`
              : "non impostato"
            }\n` +
            `PNG: ${config.pngChannel
              ? `<#${config.pngChannel}>`
              : "non impostato"
            }\n` +
            `Schedule: ${config.scheduleChannels.length > 0
              ? config.scheduleChannels.map(id => `<#${id}>`).join(", ")
              : "non impostato"
            }\n` +
            `Annuncio schedule: ${config.scheduleAnnouncementChannel
              ? `<#${config.scheduleAnnouncementChannel}>`
              : "non impostato"
            }\n` +
            `Ruolo obbligatorio schedule: ${config.requiredRoleId
              ? `<@&${config.requiredRoleId}>`
              : "non impostato"
            }\n` +
            `Ruolo opzionale schedule: ${config.optionalRoleId
              ? `<@&${config.optionalRoleId}>`
              : "non impostato"
            }\n` +
            `Canale presenze: ${config.attendanceChannel
              ? `<#${config.attendanceChannel}>`
              : "non impostato"
            }\n` +
            `Canale promemoria presenze: ${config.attendanceReminderChannel
              ? `<#${config.attendanceReminderChannel}>`
              : "non impostato"
            }\n` +
            `Utente promemoria presenze: ${config.attendanceReminderUserId
              ? `<@${config.attendanceReminderUserId}>`
              : "non impostato"
            }\n` +
            `Ruoli presenze: ${config.attendanceRoleIds.length > 0
              ? config.attendanceRoleIds.map(id => `<@&${id}>`).join(", ")
              : "non impostato"
            }\n` +
            `URL pannello presenze: ${config.attendanceWebBaseUrl || "non impostato"}\n` +
            `Logger canali: attivo`,
        });
        return;
      }
    }
  } catch (err) {
    console.error("❌ Errore:", err);

    if (!deferred) return;

    try {
      await interaction.editReply({
        content: `❌ Errore durante il comando. ${err.message || ""}`.trim(),
      });
    } catch { }
  }
});

initializeConfigStore()
  .then(() => client.login(process.env.TOKEN))
  .catch(error => {
    console.error("❌ Errore inizializzazione config store:", error);
    process.exit(1);
  });
