const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig, writeConfig } = require("../config/configStore");

const SCHEDULE_EMOJIS = ["1️⃣", "2️⃣", "3️⃣"];
const DAY_NAMES = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getNextMondayWeek() {
  const today = new Date();
  const daysUntilNextMonday = ((8 - today.getDay()) % 7) || 7;
  const nextMonday = new Date(today);

  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(nextMonday);
    current.setDate(nextMonday.getDate() + index);
    return current;
  });
}

function getCurrentWeekMonday() {
  const today = new Date();
  const jsDay = today.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getTodayScheduleIndex() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

async function fetchTextChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function sendScheduleAnnouncement(client, week) {
  const config = readConfig();
  const channel = await fetchTextChannel(client, config.scheduleAnnouncementChannel);

  if (!channel) {
    console.log("⚠️ Canale annuncio schedule non configurato correttamente");
    return;
  }

  const mentions = [];
  const allowedRoles = [];

  if (config.requiredRoleId) {
    mentions.push(`<@&${config.requiredRoleId}>`);
    allowedRoles.push(config.requiredRoleId);
  }

  if (config.optionalRoleId) {
    const optionalRole = await channel.guild.roles.fetch(config.optionalRoleId).catch(() => null);
    if (optionalRole?.members?.size > 0) {
      mentions.push(`<@&${config.optionalRoleId}>`);
      allowedRoles.push(config.optionalRoleId);
    }
  }

  await channel.send({
    content:
      `${mentions.join(" ")}\n` +
      `È uscito lo schedule della prossima settimana **${formatDate(week[0])} - ${formatDate(week[6])}**.\n` +
      `Quando potete, mettete la vostra presenza e l'orario disponibile.`,
    allowedMentions: { roles: allowedRoles },
  });
}

async function removeBotReactionsFromToday(client) {
  const config = readConfig();
  const currentSchedule = config.currentSchedule;

  if (!currentSchedule?.weekStart || !currentSchedule?.channels) {
    console.log("⚠️ Nessuno schedule salvato da aggiornare");
    return;
  }

  const currentMonday = formatISODate(getCurrentWeekMonday());
  if (currentSchedule.weekStart !== currentMonday) {
    console.log(`ℹ️ Nessuno schedule attivo per questa settimana. Salvato: ${currentSchedule.weekStart}, atteso: ${currentMonday}`);
    return;
  }

  const todayIndex = getTodayScheduleIndex();

  for (const [channelId, messageIds] of Object.entries(currentSchedule.channels)) {
    const messageId = messageIds?.[todayIndex];
    if (!messageId) continue;

    const channel = await fetchTextChannel(client, channelId);
    if (!channel) continue;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) continue;

    for (const emoji of SCHEDULE_EMOJIS) {
      const reaction = message.reactions.cache.find(item => item.emoji.name === emoji);
      if (reaction?.me) {
        await reaction.users.remove(client.user.id).catch(err => {
          console.error(`❌ Errore rimuovendo la reaction ${emoji} dal messaggio ${messageId}:`, err);
        });
      }
    }

    console.log(`✅ Reaction del bot rimosse per ${DAY_NAMES[todayIndex]} in ${channelId}`);
  }
}

async function createWeeklySchedule(client) {
  const config = readConfig();
  const channelIds = config.scheduleChannels || [];

  if (channelIds.length === 0) {
    console.log("⚠️ Nessun canale schedule configurato");
    return;
  }

  const week = getNextMondayWeek();
  const savedChannels = {};

  for (const channelId of channelIds) {
    const channel = await fetchTextChannel(client, channelId);
    if (!channel) continue;

    await channel.send(`## TRAINING SCHEDULE ${formatDate(week[0])} - ${formatDate(week[6])}`);
    savedChannels[channelId] = [];

    for (let index = 0; index < 7; index += 1) {
      const message = await channel.send(`> ${DAY_NAMES[index]} ${formatDate(week[index])}\n> 21:00, 22:00, 23:00`);

      for (const emoji of SCHEDULE_EMOJIS) {
        await message.react(emoji);
      }

      savedChannels[channelId].push(message.id);
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
  cron.schedule("35 16 * * 5", () => createWeeklySchedule(client), {
    timezone: "Europe/Rome",
  });

  cron.schedule("0 15 * * *", () => removeBotReactionsFromToday(client), {
    timezone: "Europe/Rome",
  });
}

module.exports = {
  startScheduler,
  createWeeklySchedule,
  removeBotReactionsFromToday,
  sendScheduleAnnouncement,
  getNextMondayWeek,
  getCurrentWeekMonday,
  getTodayScheduleIndex,
};