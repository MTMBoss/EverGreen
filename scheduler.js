const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig } = require("./configStore");

const ANNOUNCE_CHANNEL_ID = "1483909734653497394";
const REQUIRED_ROLE_ID = "1483903817589194778";
const OPTIONAL_ROLE_ID = "1484618223461863516";

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
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
        roles: [REQUIRED_ROLE_ID, ...(optionalRole && optionalRole.members.size > 0 ? [OPTIONAL_ROLE_ID] : [])],
      },
    });

    console.log("✅ Messaggio annuncio schedule inviato");
  } catch (err) {
    console.error("❌ Errore invio annuncio schedule:", err);
  }
}

function startScheduler(client) {
  cron.schedule(
    "35 19 * * 5",
    async () => {
      const config = readConfig();
      const channelIds = config.scheduleChannels || [];

      if (channelIds.length === 0) {
        console.log("⚠️ Nessun canale schedule configurato");
        return;
      }

      console.log("📅 Esecuzione cron...");

      const giorni = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];
      const week = getNextMondayWeek();

      for (const id of channelIds) {
        try {
          const channel = await client.channels.fetch(id);

          if (!channel || channel.type !== ChannelType.GuildText) continue;

          await channel.send(
            `## TRAINING SCHEDULE ${formatDate(week[0])} - ${formatDate(
              week[6]
            )}`
          );

          for (let i = 0; i < 7; i++) {
            const msg = await channel.send(
              `> ${giorni[i]} ${formatDate(week[i])}\n> 21:00, 22:00, 23:00`
            );

            await msg.react("1️⃣");
            await msg.react("2️⃣");
            await msg.react("3️⃣");
          }

          console.log(`✅ Schedule inviato in ${id}`);
        } catch (err) {
          console.error(`❌ Errore cron su ${id}:`, err);
        }
      }

      await sendScheduleAnnouncement(client, week);
    },
    {
      timezone: "Europe/Rome",
    }
  );
}

module.exports = { startScheduler };