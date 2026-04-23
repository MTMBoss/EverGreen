const {
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setPngChannel,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require("../config/configStore");

async function handleConfigCommand(interaction, client) {
  if (
    interaction.commandName === "set-canale-sorgente-parte1" ||
    interaction.commandName === "set-canale-sorgente-parte2" ||
    interaction.commandName === "import-match-storici"
  ) {
    await interaction.editReply({
      content:
        "ℹ️ Questo comando non serve più. Il bot usa automaticamente i canali Parte 1 e Parte 2 già configurati e continua la lettura storica in background.",
    });
    return true;
  }

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
        `Import match storico: automatico dai canali Parte 1 e Parte 2\n` +
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
module.exports = {
  handleConfigCommand,
};
