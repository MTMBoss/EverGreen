const cron = require("node-cron");
const { ChannelType } = require("discord.js");

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

function startScheduler(client, channelIds) {
  cron.schedule(
    "35 19 * * 5",
    async () => {
      console.log("📅 Esecuzione cron schedule...");

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

          console.log(`✅ Schedule inviato nel canale ${id}`);
        } catch (err) {
          console.error(`❌ Errore cron su canale ${id}:`, err);
        }
      }
    },
    {
      timezone: "Europe/Rome",
    }
  );
}

module.exports = { startScheduler };