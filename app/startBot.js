require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ChannelType,
  Partials,
} = require("discord.js");

const { startScheduler } = require("../schedule/scheduler");
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
} = require("../config/configStore");
const {
  startAttendanceLeaderboardScheduler,
} = require("../attendance/attendanceLeaderboardScheduler");
const {
  extractMatchDate,
  getSeparatorActions,
  commitSeparatorState,
} = require("../matches/publicationTracker");
const { renderMatchImage } = require("../matches/matchImageRenderer");
const {
  buildPart1Message,
  buildPart2Draft,
  buildPart2Message,
  getImageAttachments,
  parseMatchMessage,
} = require("../matches/matchMessageParser");
const {
  handleMessageCreate,
  handleMessageUpdate,
  handleMessageDelete,
} = require("../logging/channelLogger");
const {
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleMemberRoleChanges,
} = require("../logging/roleLogger");
const { initializeAttendance } = require("../attendance/attendanceService");
const {
  handleAttendanceSlashCommand,
  handleAttendanceComponent,
  isAttendanceCommand,
} = require("../attendance/attendanceDiscord");
const {
  startAttendanceReminderScheduler,
  startAttendanceRosterSyncScheduler,
} = require("../attendance/attendanceScheduler");
const { scheduleRosterSync } = require("../attendance/rosterAutoSync");
const { startAttendanceWebServer } = require("../web/server");
const {
  createMatchDraftFromPart1,
  completeMatchFromPart2,
} = require("../matches/matchService");
const { createMatchTables } = require("../matches/matchRepository");

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

async function handleMatchContextCommand(interaction) {
  if (
    interaction.commandName !== "Prepara Parte 2" &&
    interaction.commandName !== "Pubblica Match" &&
    interaction.commandName !== "Pubblica PNG"
  ) {
    return false;
  }

  await interaction.deferReply({ flags: 64 });

  const message = interaction.targetMessage;
  const parsed = parseMatchMessage(message.content || "");

  if (interaction.commandName === "Prepara Parte 2") {
    await interaction.editReply({
      content: buildPart2Draft(parsed),
    });
    return true;
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
      return true;
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
      return true;
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
    return true;
  }

  const config = readConfig();
  const images = getImageAttachments(message);
  const isPart2 = Boolean(parsed.resultLine);
  const isPart1 =
    !isPart2 &&
    Boolean(parsed.title) &&
    Boolean(parsed.dateLine) &&
    (Boolean(parsed.timeLine) || parsed.mapLines.length > 0);

  const part1Channel = config.targetChannel1
    ? await client.channels.fetch(config.targetChannel1)
    : null;
  const part2Channel = config.targetChannel2
    ? await client.channels.fetch(config.targetChannel2)
    : null;

  if (!isPart1 && !isPart2) {
    await interaction.editReply({
      content: "❌ Non ho trovato una parte valida nel messaggio selezionato.",
    });
    return true;
  }

  if (isPart1) {
    if (!part1Channel || part1Channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "❌ Canale parte 1 non configurato correttamente.",
      });
      return true;
    }

    await part1Channel.send({
      content: buildPart1Message(parsed),
    });

    await sendDefaultSeparator(part1Channel);
    await createMatchDraftFromPart1({ parsed, message });
  }

  if (isPart2) {
    if (!part2Channel || part2Channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "❌ Canale parte 2 non configurato correttamente.",
      });
      return true;
    }

    await part2Channel.send({
      content: buildPart2Message(parsed),
      files: images.slice(0, 10).map(attachment => attachment.url),
    });

    await sendDefaultSeparator(part2Channel);

    const completed = await completeMatchFromPart2({
      parsed,
      message,
    });

    const extractionMessage =
      (completed.needsReview ? `\n🛠 Stato: da rivedere manualmente` : "") +
      (completed.extractionSummary
        ? `\nℹ️ ${completed.extractionSummary}`
        : "");

    await interaction.editReply({
      content: `✅ Pubblicato${extractionMessage}`,
    });
    return true;
  }

  await interaction.editReply({
    content: "✅ Pubblicato",
  });
  return true;
}

async function handleConfigCommand(interaction) {
  if (interaction.commandName === "set-canale-parte1") {
    const channel = interaction.options.getChannel("canale", true);
    setTargetChannel1(channel.id);

    await interaction.editReply({
      content: `✅ Canale parte 1 impostato su ${channel}.`,
    });
    return true;
  }

  if (interaction.commandName === "set-canale-parte2") {
    const channel = interaction.options.getChannel("canale", true);
    setTargetChannel2(channel.id);

    await interaction.editReply({
      content: `✅ Canale parte 2 impostato su ${channel}.`,
    });
    return true;
  }

  if (interaction.commandName === "set-canale-png") {
    const channel = interaction.options.getChannel("canale", true);
    setPngChannel(channel.id);

    await interaction.editReply({
      content: `✅ Canale PNG impostato su ${channel}.`,
    });
    return true;
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
    return true;
  }

  if (interaction.commandName === "set-canale-annuncio-schedule") {
    const channel = interaction.options.getChannel("canale", true);
    setScheduleAnnouncementChannel(channel.id);

    await interaction.editReply({
      content: `✅ Canale annuncio schedule impostato su ${channel}.`,
    });
    return true;
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
    return true;
  }

  if (interaction.commandName === "mostra-config") {
    const config = readConfig();

    await interaction.editReply({
      content:
        `**Configurazione attuale**\n` +
        `Parte 1: ${config.targetChannel1 ? `<#${config.targetChannel1}>` : "non impostato"}\n` +
        `Parte 2: ${config.targetChannel2 ? `<#${config.targetChannel2}>` : "non impostato"}\n` +
        `PNG: ${config.pngChannel ? `<#${config.pngChannel}>` : "non impostato"}\n` +
        `Schedule: ${config.scheduleChannels.length > 0
          ? config.scheduleChannels.map(id => `<#${id}>`).join(", ")
          : "non impostato"}\n` +
        `Annuncio schedule: ${config.scheduleAnnouncementChannel
          ? `<#${config.scheduleAnnouncementChannel}>`
          : "non impostato"}\n` +
        `Ruolo obbligatorio schedule: ${config.requiredRoleId
          ? `<@&${config.requiredRoleId}>`
          : "non impostato"}\n` +
        `Ruolo opzionale schedule: ${config.optionalRoleId
          ? `<@&${config.optionalRoleId}>`
          : "non impostato"}\n` +
        `Canale presenze: ${config.attendanceChannel
          ? `<#${config.attendanceChannel}>`
          : "non impostato"}\n` +
        `Canale promemoria presenze: ${config.attendanceReminderChannel
          ? `<#${config.attendanceReminderChannel}>`
          : "non impostato"}\n` +
        `Utente promemoria presenze: ${config.attendanceReminderUserId
          ? `<@${config.attendanceReminderUserId}>`
          : "non impostato"}\n` +
        `Ruoli presenze: ${config.attendanceRoleIds.length > 0
          ? config.attendanceRoleIds.map(id => `<@&${id}>`).join(", ")
          : "non impostato"}\n` +
        `URL pannello presenze: ${config.attendanceWebBaseUrl || "non impostato"}\n` +
        `Logger canali: attivo`,
    });
    return true;
  }

  return false;
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Loggato come ${client.user.tag}`);
  startScheduler(client);
  startAttendanceReminderScheduler(client);
  startAttendanceRosterSyncScheduler(client);
  startAttendanceWebServer(client);
  await createMatchTables();
  startAttendanceLeaderboardScheduler(client);

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

    const oldTracked = trackedRoleIds.some(roleId =>
      oldMember.roles.cache.has(roleId)
    );
    const newTracked = trackedRoleIds.some(roleId =>
      newMember.roles.cache.has(roleId)
    );

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

  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const handled = await handleAttendanceComponent(interaction);
      if (handled) return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      await handleMatchContextCommand(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

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

    const handled = await handleConfigCommand(interaction);
    if (handled) return;
  } catch (error) {
    console.error("❌ Errore:", error);

    if (!deferred && !interaction.deferred && !interaction.replied) {
      return;
    }

    try {
      await interaction.editReply({
        content: `❌ Errore durante il comando. ${error.message || ""}`.trim(),
      });
    } catch {
      // noop
    }
  }
});

initializeConfigStore()
  .then(() => client.login(process.env.TOKEN))
  .catch(error => {
    console.error("❌ Errore inizializzazione config store:", error);
    process.exit(1);
  });
