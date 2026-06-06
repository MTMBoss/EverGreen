const { syncRosterFromGuild } = require("./rosterService");
const { ensureDate, getTodayIsoDate } = require("./attendanceService");
const { runAttendanceLeaderboardUpdate } = require("./attendanceLeaderboardScheduler");

const pendingGuilds = new Map();
const DEFAULT_DELAY_MS = 10000;

async function runRosterSync(guild, reason = "unknown", options = {}) {
    const {
        updateLeaderboard = true,
    } = options;

    await syncRosterFromGuild(guild);

    const today = getTodayIsoDate();
    await ensureDate(today);

    if (updateLeaderboard) {
        await runAttendanceLeaderboardUpdate(
            guild.client,
            `roster_auto_sync:${reason}`
        );
    }

    console.log(
        `✅ Roster sincronizzato automaticamente (${reason}) per guild ${guild.id} + giornata ${today}` +
        (updateLeaderboard ? " + leaderboard aggiornata" : "")
    );
}

function scheduleRosterSync(
    guild,
    reason = "unknown",
    delayMs = DEFAULT_DELAY_MS,
    options = {}
) {
    if (!guild) return;

    const existing = pendingGuilds.get(guild.id);
    if (existing) {
        clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(async () => {
        try {
            await runRosterSync(guild, reason, options);
        } catch (error) {
            console.error(
                `❌ Errore sync roster automatico (${reason}) guild ${guild.id}:`,
                error
            );
        } finally {
            pendingGuilds.delete(guild.id);
        }
    }, delayMs);

    pendingGuilds.set(guild.id, { timeout, reason });
}

module.exports = {
    scheduleRosterSync,
    runRosterSync,
};
