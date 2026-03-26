const { Events } = require('discord.js');
const { parseMatchMessage } = require('../../features/match/parser');
const { publishMatch, buildPart2Draft } = require('../../features/match/publisher');
const {
  readConfig,
  setTargetChannel1,
  setTargetChannel2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
} = require('../../storage/configStore');

function configSummary(config) {
  return (
    `**Configurazione attuale**\n` +
    `Parte 1: ${config.targetChannel1 ? `<#${config.targetChannel1}>` : 'non impostato'}\n` +
    `Parte 2: ${config.targetChannel2 ? `<#${config.targetChannel2}>` : 'non impostato'}\n` +
    `Schedule: ${
      config.scheduleChannels.length > 0
        ? config.scheduleChannels.map(id => `<#${id}>`).join(', ')
        : 'non impostato'
    }\n` +
    `Annuncio schedule: ${
      config.scheduleAnnouncementChannel
        ? `<#${config.scheduleAnnouncementChannel}>`
        : 'non impostato'
    }\n` +
    `Ruolo obbligatorio: ${
      config.requiredRoleId ? `<@&${config.requiredRoleId}>` : 'non impostato'
    }\n` +
    `Ruolo opzionale: ${config.optionalRoleId ? `<@&${config.optionalRoleId}>` : 'non impostato'}`
  );
}

function registraEventoCreazioneInterazione(client) {
  client.on(Events.InteractionCreate, async interaction => {
    let deferred = false;

    try {
      if (interaction.isMessageContextMenuCommand()) {
        if (
          interaction.commandName !== 'Prepara Parte 2' &&
          interaction.commandName !== 'Pubblica Match'
        ) {
          return;
        }

        await interaction.deferReply({ flags: 64 });
        deferred = true;

        const parsed = parseMatchMessage(interaction.targetMessage.content || '');

        if (interaction.commandName === 'Prepara Parte 2') {
          await interaction.editReply({ content: buildPart2Draft(parsed) });
          return;
        }

        const config = readConfig();

        await publishMatch({
          client,
          config,
          parsed,
          sourceMessage: interaction.targetMessage,
        });

        await interaction.editReply({ content: '✅ Pubblicato' });
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      await interaction.deferReply({ flags: 64 });
      deferred = true;

      if (interaction.commandName === 'set-canale-parte1') {
        const channel = interaction.options.getChannel('canale', true);
        setTargetChannel1(channel.id);
        await interaction.editReply({ content: `✅ Canale parte 1 impostato su ${channel}.` });
        return;
      }

      if (interaction.commandName === 'set-canale-parte2') {
        const channel = interaction.options.getChannel('canale', true);
        setTargetChannel2(channel.id);
        await interaction.editReply({ content: `✅ Canale parte 2 impostato su ${channel}.` });
        return;
      }

      if (interaction.commandName === 'set-canali-schedule') {
        const channel1 = interaction.options.getChannel('canale1', true);
        const channel2 = interaction.options.getChannel('canale2', false);
        const ids = [channel1.id];
        if (channel2) ids.push(channel2.id);
        setScheduleChannels(ids);

        await interaction.editReply({
          content: `✅ Canali schedule aggiornati: ${ids.map(id => `<#${id}>`).join(', ')}`,
        });
        return;
      }

      if (interaction.commandName === 'set-canale-annuncio-schedule') {
        const channel = interaction.options.getChannel('canale', true);
        setScheduleAnnouncementChannel(channel.id);
        await interaction.editReply({
          content: `✅ Canale annuncio schedule impostato su ${channel}.`,
        });
        return;
      }

      if (interaction.commandName === 'set-ruoli-schedule') {
        const requiredRole = interaction.options.getRole('ruolo_obbligatorio', true);
        const optionalRole = interaction.options.getRole('ruolo_opzionale', false);

        setRequiredRoleId(requiredRole.id);
        setOptionalRoleId(optionalRole ? optionalRole.id : '');

        await interaction.editReply({
          content:
            `✅ Ruoli schedule aggiornati:\n` +
            `Obbligatorio: <@&${requiredRole.id}>\n` +
            `Opzionale: ${optionalRole ? `<@&${optionalRole.id}>` : 'nessuno'}`,
        });
        return;
      }

      if (interaction.commandName === 'mostra-config') {
        await interaction.editReply({ content: configSummary(readConfig()) });
      }
    } catch (error) {
      if (error.message === 'NO_VALID_PART') {
        await interaction.editReply({
          content: '❌ Non ho trovato una parte valida nel messaggio selezionato.',
        });
        return;
      }

      if (error.message === 'PART1_CHANNEL_INVALID') {
        await interaction.editReply({ content: '❌ Canale parte 1 non configurato correttamente.' });
        return;
      }

      if (error.message === 'PART2_CHANNEL_INVALID') {
        await interaction.editReply({ content: '❌ Canale parte 2 non configurato correttamente.' });
        return;
      }

      console.error('❌ Errore:', error);
      if (!deferred) return;

      try {
        await interaction.editReply({ content: '❌ Errore durante il comando.' });
      } catch {
        // no-op
      }
    }
  });
}

module.exports = {
  registraEventoCreazioneInterazione,
};
