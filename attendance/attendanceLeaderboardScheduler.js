const cron = require("node-cron");
const { readConfig } = require("../configStore");
const { publishPersistentAttendanceLeaderboard } = require("./attendanceLeaderboardPublisher");

let started = false;

function startAttendanceLeaderboardScheduler(client) {
    if (started) return;
    started = true;

    cron.schedule(
        "5 0 * * *",
        async () => {
            await runAttendanceLeaderboardUpdate(client, "nightly_update");
        },
        {
            timezone: "Europe/Rome",
        }
    );

    cron.schedule(
        "0 */3 * * *",
        async () => {
            await runAttendanceLeaderboardUpdate(client, "periodic_refresh");
        },
        {
            timezone: "Europe/Rome",
        }
    );
}

async function runAttendanceLeaderboardUpdate(client, reason = "manual") {
    try {
        const config = readConfig();
        const channelId = config.attendanceLeaderboardChannel || "";

        if (!channelId) {
            console.log("⚠️ Leaderboard presenze: canale non configurato");
            return;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel) {
            console.log("⚠️ Leaderboard presenze: canale non trovato");
            return;
        }

        const guild = channel.guild || null;

        if (!guild) {
            console.log("⚠️ Leaderboard presenze: guild non trovata");
            return;
        }

        const result = await publishPersistentAttendanceLeaderboard(client, guild);

        console.log(
            `✅ Leaderboard presenze aggiornata [${reason}] in ${channelId} (${result.type})`
        );
    } catch (error) {
        console.error("❌ Errore aggiornamento automatico leaderboard presenze:", error);
    }
}

module.exports = {
    startAttendanceLeaderboardScheduler,
    runAttendanceLeaderboardUpdate,
};
