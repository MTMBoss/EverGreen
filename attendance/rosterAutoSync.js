const { syncRosterFromGuild } = require("./rosterService");

const pendingGuilds = new Map();
const DEFAULT_DELAY_MS = 10000;

function scheduleRosterSync(guild, reason = "unknown", delayMs = DEFAULT_DELAY_MS) {
    if (!guild) return;

    const existing = pendingGuilds.get(guild.id);
    if (existing) {
        clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(async () => {
        try {
            await syncRosterFromGuild(guild);
            console.log(`✅ Roster sincronizzato automaticamente (${reason}) per guild ${guild.id}`);
        } catch (error) {
            console.error(`❌ Errore sync roster automatico (${reason}) guild ${guild.id}:`, error);
        } finally {
            pendingGuilds.delete(guild.id);
        }
    }, delayMs);

    pendingGuilds.set(guild.id, { timeout, reason });
}

module.exports = {
    scheduleRosterSync,
};
