const cron = require("node-cron");
const { ChannelType } = require("discord.js");
const { readConfig } = require("../config/configStore");
const { getTodayIsoDate } = require("./attendanceService");
const { publishAttendanceForDate } = require("./attendancePublisher");
const { syncRosterFromGuild } = require("./rosterService");

const ATTENDANCE_REMINDER_CRON = "0 18 * * *";
const ATTENDANCE_ROSTER_SYNC_CRON =
    process.env.ATTENDANCE_ROSTER_SYNC_CRON || "*/30 * * * *";
const ATTENDANCE_ROSTER_SYNC_STARTUP_GRACE_MS =
    Number(process.env.ATTENDANCE_ROSTER_SYNC_STARTUP_GRACE_MS || 5 * 60 * 1000);

let rosterSyncRunning = false;
let lastRosterSyncStartedAt = 0;

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
            const uptimeMs = typeof client.uptime === "number" ? client.uptime : 0;

            if (uptimeMs > 0 && uptimeMs < ATTENDANCE_ROSTER_SYNC_STARTUP_GRACE_MS) {
                console.log(
                    `ℹ️ Sync roster schedulato saltato: bot avviato da ${Math.round(
                        uptimeMs / 1000
                    )}s (grace ${Math.round(
                        ATTENDANCE_ROSTER_SYNC_STARTUP_GRACE_MS / 1000
                    )}s)`
                );
                return;
            }

            if (rosterSyncRunning) {
                console.log("⚠️ Sync roster schedulato saltato: job precedente ancora in esecuzione");
                return;
            }

            rosterSyncRunning = true;
            lastRosterSyncStartedAt = Date.now();

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
                logRosterSyncError(error);
            } finally {
                const elapsedMs = Date.now() - lastRosterSyncStartedAt;
                console.log(`ℹ️ Sync roster schedulato terminato in ${elapsedMs} ms`);
                rosterSyncRunning = false;
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

function logRosterSyncError(error) {
    if (!error) {
        console.error("❌ Errore scheduler sync roster: sconosciuto");
        return;
    }

    if (error.name === "GatewayRateLimitError") {
        const retryAfter =
            typeof error.data?.retry_after === "number"
                ? `${error.data.retry_after}s`
                : "n/d";

        console.error(
            `❌ Errore scheduler sync roster: rate limit gateway Discord (retry_after=${retryAfter})`
        );
        return;
    }

    console.error(
        `❌ Errore scheduler sync roster: ${error.message || String(error)}`
    );
}

module.exports = {
    startAttendanceReminderScheduler,
    startAttendanceRosterSyncScheduler,
};
