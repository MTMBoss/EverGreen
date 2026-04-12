const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig } = require("../configStore");
const { getTodayIsoDate } = require("./attendanceService");
const { publishAttendanceForDate } = require("./attendancePublisher");

function startAttendanceReminderScheduler(client) {
    const cronExpression = process.env.ATTENDANCE_REMINDER_CRON || "0 18 * * *";

    cron.schedule(
        cronExpression,
        async () => {
            try {
                const config = readConfig();
                const reminderChannelId = config.attendanceReminderChannel;
                const reminderUserId = config.attendanceReminderUserId;
                const attendanceChannelId = config.attendanceChannel;
                const today = getTodayIsoDate();

                if (attendanceChannelId) {
                    try {
                        const guild = client.guilds.cache.get(process.env.GUILD_ID) || null;
                        await publishAttendanceForDate(client, guild, today);
                    } catch (error) {
                        console.error("❌ Errore pubblicazione automatica presenze:", error);
                    }
                }

                if (!reminderChannelId) {
                    console.log("⚠️ Canale promemoria presenze non configurato");
                    return;
                }

                const channel = await client.channels.fetch(reminderChannelId);
                if (!channel || channel.type !== ChannelType.GuildText) {
                    console.log("⚠️ Canale promemoria presenze non trovato o non testuale");
                    return;
                }

                const mention = reminderUserId ? `<@${reminderUserId}>` : "@staff";
                const attendanceChannelText = attendanceChannelId
                    ? ` nel canale <#${attendanceChannelId}>`
                    : "";
                const webText = config.attendanceWebBaseUrl
                    ? `\nPannello web: ${config.attendanceWebBaseUrl}/presenze?date=${today}`
                    : "";

                await channel.send({
                    content:
                        `${mention} ricordati di inserire le presenze di oggi${attendanceChannelText}.` +
                        webText,
                    allowedMentions: {
                        users: reminderUserId ? [reminderUserId] : [],
                    },
                });

                console.log("✅ Promemoria presenze inviato");
            } catch (error) {
                console.error("❌ Errore scheduler presenze:", error);
            }
        },
        {
            timezone: "Europe/Rome",
        }
    );
}

module.exports = {
    startAttendanceReminderScheduler,
};
