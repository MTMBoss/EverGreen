const cron = require('node-cron');
const { ChannelType } = require('discord.js');
const { APP_CONFIG } = require('../../config');
const { readConfig, writeConfig } = require('../../storage/configStore');
const { formatDate, formatISODate, getNextMondayWeek } = require('../../utils/date');
const { SCHEDULE_EMOJIS, WEEKDAY_LABELS } = require('./constants');
const { sendScheduleAnnouncement } = require('./announcements');
const { removeBotReactionsFromToday } = require('./reactions');

async function publishWeeklySchedule(client) {
  const config = readConfig();
  const channelIds = config.scheduleChannels || [];

  if (channelIds.length === 0) {
    console.log('⚠️ Nessun canale schedule configurato');
    return;
  }

  console.log('📅 Esecuzione cron creazione schedule...');

  const week = getNextMondayWeek();
  const savedChannels = {};

  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      await channel.send(`## TRAINING SCHEDULE ${formatDate(week[0])} - ${formatDate(week[6])}`);
      savedChannels[channelId] = [];

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const message = await channel.send(
          `> ${WEEKDAY_LABELS[dayIndex]} ${formatDate(week[dayIndex])}\n> 21:00, 22:00, 23:00`
        );

        for (const emoji of SCHEDULE_EMOJIS) {
          await message.react(emoji);
        }

        savedChannels[channelId].push(message.id);
      }

      console.log(`✅ Schedule inviato in ${channelId}`);
    } catch (error) {
      console.error(`❌ Errore cron su ${channelId}:`, error);
    }
  }

  const updatedConfig = readConfig();
  updatedConfig.currentSchedule = {
    weekStart: formatISODate(week[0]),
    channels: savedChannels,
  };
  writeConfig(updatedConfig);

  await sendScheduleAnnouncement(client, week);
}

function startScheduler(client) {
  cron.schedule(APP_CONFIG.scheduleCreateCron, async () => {
    await publishWeeklySchedule(client);
  }, { timezone: APP_CONFIG.timezone });

  cron.schedule(APP_CONFIG.scheduleReactionCleanupCron, async () => {
    console.log('🕒 Esecuzione cron rimozione reaction giornaliera...');
    await removeBotReactionsFromToday(client);
  }, { timezone: APP_CONFIG.timezone });
}

module.exports = {
  startScheduler,
  publishWeeklySchedule,
};
