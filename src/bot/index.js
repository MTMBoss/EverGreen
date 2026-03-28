require("dotenv").config();

const { Client, GatewayIntentBits, Events, ChannelType } = require("discord.js");
const { startScheduler } = require("../scheduler");
const {
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require("../config/configStore");
const { parseMatchMessage } = require("../utils/matchParser");
const { buildPart2Draft, getImageAttachments, publishMatch } = require("../services/publishService");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Loggato come ${client.user.tag}`);
  startScheduler(client);
});

async function fetchConfiguredTextChannel(channelId) {
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function handleMessageContext(interaction) {
  const message = interaction.targetMessage;
  const parsed = parseMatchMessage(message.content || "");

  if (interaction.commandName === "Prepara Parte 2") {
    await interaction.editReply({ content: buildPart2Draft(parsed) });
    return;
  }

  const config = readConfig();
  const result = await publishMatch({
    parsed,
    channels: {
      part1: await fetchConfiguredTextChannel(config.targetChannel1),
      part2: await fetchConfiguredTextChannel(config.targetChannel2),
    },
    imageAttachments: getImageAttachments(message),
  });

  await interaction.editReply({
    content: `✅ Pubblicato (${result.published.join(", ")})`,
  });
}

async function handleSlashCommand(interaction) {
  switch (interaction.commandName) {
    case "set-canale-parte1": {
      const channel = interaction.options.getChannel("canale", true);
      setTargetChannel1(channel.id);
      await interaction.editReply({ content: `✅ Canale parte 1 impostato su ${channel}.` });
      return;
    }

    case "set-canale-parte2": {
      const channel = interaction.options.getChannel("canale", true);
      setTargetChannel2(channel.id);
      await interaction.editReply({ content: `✅ Canale parte 2 impostato su ${channel}.` });
      return;
    }

    case "set-canali-schedule": {
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

    case "set-canale-annuncio-schedule": {
      const channel = interaction.options.getChannel("canale", true);
      setScheduleAnnouncementChannel(channel.id);
      await interaction.editReply({
        content: `✅ Canale annuncio schedule impostato su ${channel}.`,
      });
      return;
    }

    case "set-ruoli-schedule": {
      const requiredRole = interaction.options.getRole("ruolo_obbligatorio", true);
      const optionalRole = interaction.options.getRole("ruolo_opzionale", false);

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

    case "mostra-config": {
      const config = readConfig();
      await interaction.editReply({
        content:
          `**Configurazione attuale**\n` +
          `Parte 1: ${config.targetChannel1 ? `<#${config.targetChannel1}>` : "non impostato"}\n` +
          `Parte 2: ${config.targetChannel2 ? `<#${config.targetChannel2}>` : "non impostato"}\n` +
          `Schedule: ${config.scheduleChannels.length > 0 ? config.scheduleChannels.map(id => `<#${id}>`).join(", ") : "non impostato"}\n` +
          `Annuncio schedule: ${config.scheduleAnnouncementChannel ? `<#${config.scheduleAnnouncementChannel}>` : "non impostato"}\n` +
          `Ruolo obbligatorio: ${config.requiredRoleId ? `<@&${config.requiredRoleId}>` : "non impostato"}\n` +
          `Ruolo opzionale: ${config.optionalRoleId ? `<@&${config.optionalRoleId}>` : "non impostato"}`,
      });
      return;
    }

    default:
      await interaction.editReply({ content: "❌ Comando non gestito." });
  }
}

client.on(Events.InteractionCreate, async interaction => {
  let deferred = false;

  try {
    if (
      interaction.isMessageContextMenuCommand() &&
      ["Prepara Parte 2", "Pubblica Match"].includes(interaction.commandName)
    ) {
      await interaction.deferReply({ flags: 64 });
      deferred = true;
      await handleMessageContext(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ flags: 64 });
      deferred = true;
      await handleSlashCommand(interaction);
    }
  } catch (error) {
    console.error("❌ Errore:", error);

    if (deferred) {
      await interaction.editReply({
        content: `❌ Errore durante il comando: ${error.message || "errore sconosciuto"}`,
      }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
