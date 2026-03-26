const { ChannelType } = require('discord.js');
const { readConfig } = require('../../storage/configStore');
const { formatDate } = require('../../utils/date');

async function sendScheduleAnnouncement(client, week) {
  try {
    const config = readConfig();
    const channelId = config.scheduleAnnouncementChannel;

    if (!channelId) {
      console.log('⚠️ Canale annuncio schedule non configurato');
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.log('⚠️ Canale annuncio schedule non trovato o non testuale');
      return;
    }

    const guild = channel.guild;
    if (!guild) {
      console.log('⚠️ Guild non trovata per il canale annuncio');
      return;
    }

    const requiredRoleId = config.requiredRoleId;
    const optionalRoleId = config.optionalRoleId;

    const mentions = [];
    if (requiredRoleId) mentions.push(`<@&${requiredRoleId}>`);

    let optionalRole = null;
    if (optionalRoleId) {
      optionalRole = await guild.roles.fetch(optionalRoleId).catch(() => null);
      if (optionalRole?.members?.size > 0) mentions.push(`<@&${optionalRoleId}>`);
    }

    await channel.send({
      content:
        `${mentions.join(' ')}\n` +
        `È uscito lo schedule della prossima settimana **${formatDate(week[0])} - ${formatDate(
          week[6]
        )}**.\n` +
        `Quando potete, mettete la vostra presenza e l'orario disponibile.`,
      allowedMentions: {
        roles: [
          ...(requiredRoleId ? [requiredRoleId] : []),
          ...(optionalRole?.members?.size > 0 ? [optionalRoleId] : []),
        ],
      },
    });

    console.log('✅ Messaggio annuncio schedule inviato');
  } catch (error) {
    console.error('❌ Errore invio annuncio schedule:', error);
  }
}

module.exports = {
  sendScheduleAnnouncement,
};
