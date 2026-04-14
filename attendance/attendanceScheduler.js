const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig } = require("../configStore");
const { getTodayIsoDate } = require("./attendanceService");
const { publishAttendanceForDate } = require("./attendancePublisher");
const { syncRosterFromGuild } = require("./rosterService");

const ATTENDANCE_REMINDER_CRON = "0 18 * * *";
const ATTENDANCE_ROSTER_SYNC_CRON = "*/10 * * * *";

function startAttendanceReminderScheduler(client) {
    cron.schedule(
        ATTENDANCE_REMINDER_CRON,
        async () => {
            try {
                const config = readConfig();
                const reminderChannelId = config.attendanceReminderChannel;
                const reminderUserId = config.attendanceReminderUserId;
                const attendanceChannelId = config.attendanceChannel;
                const today = getTodayIsoDate();

                const guild = await resolveAttendanceGuild(
                    client,
                    attendanceChannelId,
                    reminderChannelId
                );

                if (attendanceChannelId && guild) {
                    try {
                        await publishAttendanceForDate(client, guild, today);
                    } catch (error) {
                        console.error("❌ Errore pubblicazione automatica presenze:", error);
                    }
                }

                if (!reminderChannelId) {
                    console.log("⚠️ Canale promemoria presenze non configurato");
                    return;
                }

                const channel = await client.channels.fetch(reminderChannelId).catch(() => null);

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

function startAttendanceRosterSyncScheduler(client) {
    cron.schedule(
        ATTENDANCE_ROSTER_SYNC_CRON,
        async () => {
            try {
                const config = readConfig();

                const guild = await resolveAttendanceGuild(
                    client,
                    config.attendanceChannel,
                    config.attendanceReminderChannel
                );

                if (!guild) {
                    console.log("⚠️ Nessuna guild disponibile per sync roster automatico");
                    return;
                }

                await syncRosterFromGuild(guild);
                console.log("✅ Sync roster automatico schedulato completato");
            } catch (error) {
                console.error("❌ Errore scheduler sync roster:", error);
            }
        },
        {
            timezone: "Europe/Rome",
        }
    );
}

async function resolveAttendanceGuild(client, attendanceChannelId, reminderChannelId) {
    const candidateChannelIds = [attendanceChannelId, reminderChannelId].filter(Boolean);

    for (const channelId of candidateChannelIds) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel?.guild) {
            return channel.guild;
        }
    }

    const firstGuild = client.guilds.cache.first();
    return firstGuild || null;
}

module.exports = {
    startAttendanceReminderScheduler,
    startAttendanceRosterSyncScheduler,
};
