const { ChannelType } = require('discord.js');
const { readConfig } = require('../../storage/configStore');
const { formatISODate, getCurrentWeekMonday, getTodayScheduleIndex } = require('../../utils/date');
const { SCHEDULE_EMOJIS, WEEKDAY_LABELS } = require('./constants');

async function removeBotReactionsFromToday(client) {
  try {
    const config = readConfig();
    const currentSchedule = config.currentSchedule;

    if (!currentSchedule || !currentSchedule.weekStart || !currentSchedule.channels) {
      console.log('⚠️ Nessuno schedule salvato da aggiornare');
      return;
    }

    const currentMonday = formatISODate(getCurrentWeekMonday());
    if (currentSchedule.weekStart !== currentMonday) {
      console.log(
        `ℹ️ Nessuno schedule attivo per questa settimana. Salvato: ${currentSchedule.weekStart}, atteso: ${currentMonday}`
      );
      return;
    }

    const todayIndex = getTodayScheduleIndex();

    for (const [channelId, messageIds] of Object.entries(currentSchedule.channels)) {
      try {
        const messageId = messageIds?.[todayIndex];
        if (!messageId) continue;

        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) continue;

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          console.log(`⚠️ Messaggio ${messageId} non trovato in ${channelId}`);
          continue;
        }

        for (const emoji of SCHEDULE_EMOJIS) {
          const reaction = message.reactions.cache.find(r => r.emoji.name === emoji);
          if (reaction?.me) {
            await reaction.users.remove(client.user.id).catch(error => {
              console.error(
                `❌ Errore rimuovendo la reaction ${emoji} dal messaggio ${messageId}:`,
                error
              );
            });
          }
        }

        console.log(
          `✅ Reaction del bot rimosse per ${WEEKDAY_LABELS[todayIndex]} in ${channelId}`
        );
      } catch (error) {
        console.error(`❌ Errore aggiornando il canale ${channelId}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Errore nella rimozione giornaliera delle reaction:', error);
  }
}

module.exports = {
  removeBotReactionsFromToday,
};
