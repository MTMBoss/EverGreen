const {
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setPngChannel,
  setMatchImportState,
  setSourceChannelPart1,
  setSourceChannelPart2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require("../config/configStore");
const {
  importMatchHistoryFromConfiguredSources,
} = require("../matches/autoMatchImporter");
const { removeAllMatches } = require("../matches/matchService");

async function handleConfigCommand(interaction, client) {
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

  if (interaction.commandName === "set-canale-sorgente-parte1") {
    const channel = interaction.options.getChannel("canale", true);
    setSourceChannelPart1(channel.id);

    await interaction.editReply({
      content: `✅ Canale sorgente parte 1 impostato su ${channel}.`,
    });
    return true;
  }

  if (interaction.commandName === "set-canale-sorgente-parte2") {
    const channel = interaction.options.getChannel("canale", true);
    setSourceChannelPart2(channel.id);

    await interaction.editReply({
      content: `✅ Canale sorgente parte 2 impostato su ${channel}.`,
    });
    return true;
  }

  if (interaction.commandName === "import-match-storici") {
    const channelPart1 = interaction.options.getChannel("canale_parte1", true);
    const channelPart2 = interaction.options.getChannel("canale_parte2", true);

    if (channelPart1.id === channelPart2.id) {
      await interaction.editReply({
        content:
          "❌ Hai selezionato lo stesso canale per Parte 1 e Parte 2. " +
          "Servono due canali diversi, altrimenti il bot rilegge la stessa cronologia due volte.",
      });
      return true;
    }

    setSourceChannelPart1(channelPart1.id);
    setSourceChannelPart2(channelPart2.id);

    const config = readConfig();
    const previousState = config.matchImportState || {};
    const sameImportSession =
      previousState.sourceChannelPart1 === channelPart1.id &&
      previousState.sourceChannelPart2 === channelPart2.id &&
      !previousState.completed;

    if (!sameImportSession) {
      await removeAllMatches();
      setMatchImportState({
        sourceChannelPart1: channelPart1.id,
        sourceChannelPart2: channelPart2.id,
        part1Before: "",
        part2Before: "",
        completed: false,
      });
    }

    const summary = await importMatchHistoryFromConfiguredSources(client, {
      sourceChannelPart1: channelPart1.id,
      sourceChannelPart2: channelPart2.id,
      part1Before: sameImportSession ? previousState.part1Before || "" : "",
      part2Before: sameImportSession ? previousState.part2Before || "" : "",
      maxMessagesPerChannel: 40,
    });
    const nextState = {
      sourceChannelPart1: channelPart1.id,
      sourceChannelPart2: channelPart2.id,
      part1Before: summary.progress?.part1?.before || "",
      part2Before: summary.progress?.part2?.before || "",
      completed: Boolean(summary.progress?.part1?.completed) && Boolean(summary.progress?.part2?.completed),
    };
    setMatchImportState(nextState);
    const part1Summary = summary.channels.find(item => item.type === "part1") || null;
    const part2Summary = summary.channels.find(item => item.type === "part2") || null;

    const failedPreview = summary.failedMatches
      .slice(0, 5)
      .map(item =>
        [
          item.title ? `Titolo: ${item.title}` : "",
          item.dateLine ? `Data: ${item.dateLine}` : "",
          item.resultLine ? `Risultato: ${item.resultLine}` : "",
        ]
          .filter(Boolean)
          .join(" | ")
      )
      .filter(Boolean);

    const skippedPreview = (summary.skippedMessages || [])
      .slice(0, 5)
      .map(item =>
        [
          item.channelType ? `[${item.channelType}]` : "",
          item.reason ? `Motivo: ${item.reason}` : "",
          item.createdAt ? `Data msg: ${item.createdAt}` : "",
          item.preview ? `Anteprima: ${item.preview}` : "",
        ]
          .filter(Boolean)
          .join(" | ")
      )
      .filter(Boolean);

    const channelBreakdown = [
      formatImportChannelSummary("Parte 1", part1Summary),
      formatImportChannelSummary("Parte 2", part2Summary),
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.editReply({
      content:
        `${sameImportSession ? "✅ Import storico ripreso" : "✅ Archivio match azzerato e import storico avviato"}\n` +
        `Canale parte 1: ${channelPart1} (\`${channelPart1.id}\`)\n` +
        `Canale parte 2: ${channelPart2} (\`${channelPart2.id}\`)\n` +
        `Lettura cronologia: **${nextState.completed ? "completa" : "parziale, rilancia il comando per continuare"}**\n` +
        `Messaggi scansionati: **${summary.scanned}**\n` +
        `Match importati: **${summary.imported}**\n` +
        `Già presenti: **${summary.duplicates}**\n` +
        `Saltati: **${summary.skipped}**\n` +
        `Errori: **${summary.failed}**\n` +
        `Cursor parte 1: **${nextState.part1Before ? "in corso" : "fine raggiunta"}**\n` +
        `Cursor parte 2: **${nextState.part2Before ? "in corso" : "fine raggiunta"}**` +
        (channelBreakdown ? `\n\n${channelBreakdown}` : "") +
        (failedPreview.length
          ? `\n\nPrime partite non collegate:\n- ${failedPreview.join("\n- ")}`
          : "") +
        (skippedPreview.length
          ? `\n\nPrimi messaggi saltati:\n- ${skippedPreview.join("\n- ")}`
          : ""),
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
        `Sorgente parte 1: ${config.sourceChannelPart1 ? `<#${config.sourceChannelPart1}>` : "non impostato"}\n` +
        `Sorgente parte 2: ${config.sourceChannelPart2 ? `<#${config.sourceChannelPart2}>` : "non impostato"}\n` +
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

function formatImportChannelSummary(label, summary) {
  if (!summary) return "";
  if (summary.error) {
    return `**${label}**\nScansione non riuscita: ${summary.error}`;
  }

  return (
    `**${label}**\n` +
    `Scansionati: **${summary.scanned}**\n` +
    `Importati: **${summary.imported}**\n` +
    `Già presenti: **${summary.duplicates}**\n` +
    `Saltati: **${summary.skipped}**\n` +
    `Errori: **${summary.failed || 0}**`
  );
}

module.exports = {
  handleConfigCommand,
};
