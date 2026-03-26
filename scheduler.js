const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig, writeConfig } = require("./configStore");

const ANNOUNCE_CHANNEL_ID = "1483903818709340348";
const REQUIRED_ROLE_ID = "1483903817589194778";
const OPTIONAL_ROLE_ID = "1484618223461863516";

const SCHEDULE_EMOJIS = ["1️⃣", "2️⃣", "3️⃣"];

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

function formatISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function getNextMondayWeek() {
  const today = new Date();
  const day = today.getDay();

  let daysUntilNextMonday = (8 - day) % 7;
  if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;

  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nextMonday);
    d.setDate(nextMonday.getDate() + i);
    return d;
  });
}

function getCurrentWeekMonday() {
  const today = new Date();
  const jsDay = today.getDay(); // DOM=0, LUN=1, ..., SAB=6
  const diff = jsDay === 0 ? -6 : 1 - jsDay;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

function getTodayScheduleIndex() {
  const jsDay = new Date().getDay(); // DOM=0, LUN=1...
  return jsDay === 0 ? 6 : jsDay - 1; // LUN=0 ... DOM=6
}

async function sendScheduleAnnouncement(client, week) {
  try {
    const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.log("⚠️ Canale annuncio schedule non trovato o non testuale");
      return;
    }

    const guild = channel.guild;
    if (!guild) {
      console.log("⚠️ Guild non trovata per il canale annuncio");
      return;
    }

    let mentions = [`<@&${REQUIRED_ROLE_ID}>`];

    const optionalRole = await guild.roles.fetch(OPTIONAL_ROLE_ID).catch(() => null);

    if (optionalRole && optionalRole.members && optionalRole.members.size > 0) {
      mentions.push(`<@&${OPTIONAL_ROLE_ID}>`);
    }

    const message =
      `${mentions.join(" ")}\n` +
      `È uscito lo schedule della prossima settimana **${formatDate(week[0])} - ${formatDate(week[6])}**.\n` +
      `Quando potete, mettete la vostra presenza e l'orario disponibile.`;

    await channel.send({
      content: message,
      allowedMentions: {
        roles: [
          REQUIRED_ROLE_ID,
          ...(optionalRole && optionalRole.members.size > 0 ? [OPTIONAL_ROLE_ID] : []),
        ],
      },
    });

    console.log("✅ Messaggio annuncio schedule inviato");
  } catch (err) {
    console.error("❌ Errore invio annuncio schedule:", err);
  }
}

async function removeBotReactionsFromToday(client) {
  try {
    const config = readConfig();
    const currentSchedule = config.currentSchedule;

    if (!currentSchedule || !currentSchedule.weekStart || !currentSchedule.channels) {
      console.log("⚠️ Nessuno schedule salvato da aggiornare");
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
    const giornoNomi = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

    for (const [channelId, messageIds] of Object.entries(currentSchedule.channels)) {
      try {
        const messageId = messageIds?.[todayIndex];
        if (!messageId) continue;

        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) continue;

        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) {
          console.log(`⚠️ Messaggio ${messageId} non trovato in ${channelId}`);
          continue;
        }

        for (const emoji of SCHEDULE_EMOJIS) {
          const reaction = msg.reactions.cache.find((r) => r.emoji.name === emoji);

          if (reaction && reaction.me) {
            await reaction.users.remove(client.user.id).catch((err) => {
              console.error(
                `❌ Errore rimuovendo la reaction ${emoji} dal messaggio ${messageId}:`,
                err
              );
            });
          }
        }

        console.log(`✅ Reaction del bot rimosse per ${giornoNomi[todayIndex]} in ${channelId}`);
      } catch (err) {
        console.error(`❌ Errore aggiornando il canale ${channelId}:`, err);
      }
    }
  } catch (err) {
    console.error("❌ Errore nella rimozione giornaliera delle reaction:", err);
  }
}

function startScheduler(client) {
  // CREAZIONE SCHEDULE - venerdì 19:35
  cron.schedule(
    "30 13 * * 4",
    async () => {
      const config = readConfig();
      const channelIds = config.scheduleChannels || [];

      if (channelIds.length === 0) {
        console.log("⚠️ Nessun canale schedule configurato");
        return;
      }

      console.log("📅 Esecuzione cron creazione schedule...");

      const giorni = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];
      const week = getNextMondayWeek();

      const savedChannels = {};

      for (const id of channelIds) {
        try {
          const channel = await client.channels.fetch(id);

          if (!channel || channel.type !== ChannelType.GuildText) continue;

          await channel.send(
            `## TRAINING SCHEDULE ${formatDate(week[0])} - ${formatDate(week[6])}`
          );

          savedChannels[id] = [];

          for (let i = 0; i < 7; i++) {
            const msg = await channel.send(
              `> ${giorni[i]} ${formatDate(week[i])}\n> 21:00, 22:00, 23:00`
            );

            await msg.react("1️⃣");
            await msg.react("2️⃣");
            await msg.react("3️⃣");

            savedChannels[id].push(msg.id);
          }

          console.log(`✅ Schedule inviato in ${id}`);
        } catch (err) {
          console.error(`❌ Errore cron su ${id}:`, err);
        }
      }

      const updatedConfig = readConfig();
      updatedConfig.currentSchedule = {
        weekStart: formatISODate(week[0]),
        channels: savedChannels,
      };
      writeConfig(updatedConfig);

      await sendScheduleAnnouncement(client, week);
    },
    {
      timezone: "Europe/Rome",
    }
  );

  // RIMOZIONE REACTION DEL BOT - ogni giorno alle 15:00
  cron.schedule(
    "0 15 * * *",
    async () => {
      console.log("🕒 Esecuzione cron rimozione reaction giornaliera...");
      await removeBotReactionsFromToday(client);
    },
    {
      timezone: "Europe/Rome",
    }
  );
}

module.exports = { startScheduler };