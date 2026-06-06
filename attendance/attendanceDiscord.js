const {
    readConfig,
    setAttendanceChannel,
    setAttendanceReminderChannel,
    setAttendanceReminderUserId,
    setAttendanceRoleIds,
    setAttendanceWebBaseUrl,
} = require("../config/configStore");

const {
    normalizeDateInput,
    getTodayIsoDate,
    ensureDate,
    setSingleSlot,
    setDaySlots,
    getDayView,
} = require("./attendanceService");

const { runAttendanceLeaderboardUpdate } = require("./attendanceLeaderboardScheduler");

const { syncRosterFromGuild } = require("./rosterService");
const { publishAttendanceForDate } = require("./attendancePublisher");
const {
    publishAttendanceLeaderboard,
    handleAttendanceLeaderboardComponent,
    setAttendanceLeaderboardChannel,
    publishPersistentAttendanceLeaderboard,
} = require("./attendanceLeaderboardPublisher");

const ATTENDANCE_COMMANDS = new Set([
    "set-canale-presenze",
    "set-canale-promemoria-presenze",
    "set-utente-promemoria-presenze",
    "set-ruoli-presenze",
    "set-url-pannello-presenze",
    "presenze-sync",
    "pubblica-presenze-oggi",
    "presenze-oggi",
    "presenza-set",
    "presenza-set-giornata",
    "presenze-recap",
    "link-presenze",
    "leaderboard-presenze",
    "set-canale-leaderboard-presenze",
    "pubblica-leaderboard-presenze",
]);

function isAttendanceCommand(name) {
    return ATTENDANCE_COMMANDS.has(name);
}

async function handleAttendanceSlashCommand(interaction, client) {
    if (!interaction.isChatInputCommand()) return false;
    if (!isAttendanceCommand(interaction.commandName)) return false;

    switch (interaction.commandName) {
        case "set-canale-presenze": {
            const channel = interaction.options.getChannel("canale", true);
            setAttendanceChannel(channel.id);
            await interaction.editReply({
                content: `✅ Canale presenze impostato su ${channel}.`,
            });
            return true;
        }

        case "set-canale-promemoria-presenze": {
            const channel = interaction.options.getChannel("canale", true);
            setAttendanceReminderChannel(channel.id);
            await interaction.editReply({
                content: `✅ Canale promemoria presenze impostato su ${channel}.`,
            });
            return true;
        }

        case "set-utente-promemoria-presenze": {
            const user = interaction.options.getUser("utente", true);
            setAttendanceReminderUserId(user.id);
            await interaction.editReply({
                content: `✅ Utente promemoria presenze impostato su <@${user.id}>.`,
            });
            return true;
        }

        case "set-ruoli-presenze": {
            const role1 = interaction.options.getRole("ruolo1", true);
            const role2 = interaction.options.getRole("ruolo2", false);
            const roleIds = [role1.id];
            if (role2) roleIds.push(role2.id);

            setAttendanceRoleIds(roleIds);
            await interaction.editReply({
                content: `✅ Ruoli presenze aggiornati: ${roleIds.map(id => `<@&${id}>`).join(", ")}`,
            });
            return true;
        }

        case "set-url-pannello-presenze": {
            const url = interaction.options.getString("url", true).trim().replace(/\/$/, "");
            setAttendanceWebBaseUrl(url);
            await interaction.editReply({
                content: `✅ URL pannello presenze impostato su ${url}`,
            });
            return true;
        }

        case "set-canale-leaderboard-presenze": {
            const channel = interaction.options.getChannel("canale", true);
            const tipo = interaction.options.getString("tipo", false) || "settimana";

            await setAttendanceLeaderboardChannel(channel.id, tipo);

            await interaction.editReply({
                content: `✅ Canale leaderboard presenze impostato su ${channel} con vista predefinita **${tipo}**.`,
            });
            return true;
        }

        case "pubblica-leaderboard-presenze": {
            const tipo = interaction.options.getString("tipo", false) || null;
            const result = await publishPersistentAttendanceLeaderboard(client, interaction.guild, tipo);

            await interaction.editReply({
                content:
                    result.updated
                        ? `✅ Leaderboard presenze aggiornata in ${result.channel} con vista **${result.type}**.`
                        : `✅ Leaderboard presenze pubblicata in ${result.channel} con vista **${result.type}**.`,
            });
            return true;
        }

        case "presenze-sync": {
            const result = await syncRosterFromGuild(interaction.guild);

            const today = getTodayIsoDate();
            await ensureDate(today);
            await runAttendanceLeaderboardUpdate(client, "roster_sync");

            await interaction.editReply({
                content:
                    `✅ Roster presenze sincronizzato.\n` +
                    `Ruoli monitorati: ${result.trackedRoleIds.map(id => `<@&${id}>`).join(", ")}\n` +
                    `Membri trovati: **${result.count}**\n` +
                    `Giornata **${today}** aggiornata.\n` +
                    `Leaderboard aggiornata automaticamente.`,
            });
            return true;
        }

        case "pubblica-presenze-oggi": {
            const date = normalizeDateOption(interaction.options.getString("data"));
            const published = await publishAttendanceForDate(client, interaction.guild, date);
            await interaction.editReply({
                content: `✅ Presenze del ${date} pubblicate in ${published.channel}. Messaggi inviati: ${published.messageCount}.`,
            });
            return true;
        }

        case "presenze-oggi": {
            const date = normalizeDateOption(interaction.options.getString("data"));
            const dayView = await getDayView(date);
            await interaction.editReply({
                content: formatSummaryMessage(dayView),
            });
            return true;
        }

        case "presenza-set": {
            const user = interaction.options.getUser("utente", true);
            const fascia = interaction.options.getString("fascia", true);
            const disponibile = interaction.options.getBoolean("disponibile", true);
            const data = normalizeDateOption(interaction.options.getString("data"));
            const slot = slotKeyFromChoice(fascia);

            const dayView = await setSingleSlot({
                dateInput: data,
                discordUserId: user.id,
                slot,
                value: disponibile,
                updatedByDiscordUserId: interaction.user.id,
            });

            await ensureDate(getTodayIsoDate());
            await runAttendanceLeaderboardUpdate(client, "attendance_change");

            await interaction.editReply({
                content:
                    `✅ Presenza aggiornata per <@${user.id}> il **${data}**.\n` +
                    `Fascia ${fascia}: **${disponibile ? "presente" : "assente"}**\n\n` +
                    formatSummaryMessage(dayView),
            });
            return true;
        }

        case "presenza-set-giornata": {
            const user = interaction.options.getUser("utente", true);
            const data = normalizeDateOption(interaction.options.getString("data"));
            const dalle21 = interaction.options.getBoolean("dalle_21", true);
            const dalle22 = interaction.options.getBoolean("dalle_22", true);
            const dalle23 = interaction.options.getBoolean("dalle_23", true);
            const note = interaction.options.getString("note", false) || "";

            const dayView = await setDaySlots({
                dateInput: data,
                discordUserId: user.id,
                slot_21_22: dalle21,
                slot_22_23: dalle22,
                slot_23_00: dalle23,
                notes: note,
                updatedByDiscordUserId: interaction.user.id,
            });

            await ensureDate(getTodayIsoDate());
            await runAttendanceLeaderboardUpdate(client, "attendance_change");

            await interaction.editReply({
                content:
                    `✅ Giornata aggiornata per <@${user.id}> il **${data}**.\n` +
                    `21-22: ${dalle21 ? "✅" : "❌"} | 22-23: ${dalle22 ? "✅" : "❌"} | 23-00: ${dalle23 ? "✅" : "❌"}` +
                    `${note ? `\nNote: ${note}` : ""}` +
                    `\n\n${formatSummaryMessage(dayView)}`,
            });
            return true;
        }


        case "presenze-recap": {
            const date = normalizeDateOption(interaction.options.getString("data"));
            const dayView = await getDayView(date);
            await interaction.editReply({
                content: formatDetailedRecap(dayView),
            });
            return true;
        }

        case "link-presenze": {
            const date = normalizeDateOption(interaction.options.getString("data"));
            const config = readConfig();

            if (!config.attendanceWebBaseUrl) {
                await interaction.editReply({
                    content: "❌ URL pannello presenze non configurato. Usa /set-url-pannello-presenze.",
                });
                return true;
            }

            await interaction.editReply({
                content: `🔗 Pannello presenze: ${config.attendanceWebBaseUrl}/presenze?date=${date}`,
            });
            return true;
        }

        case "leaderboard-presenze": {
            const tipo = interaction.options.getString("tipo", false) || "settimana";
            await publishAttendanceLeaderboard(interaction, tipo);
            return true;
        }

        default:
            return false;
    }
}

async function handleAttendanceComponent(interaction) {
    return handleAttendanceLeaderboardComponent(interaction);
}

function normalizeDateOption(value) {
    return normalizeDateInput(value || getTodayIsoDate());
}

function slotKeyFromChoice(choice) {
    if (choice === "21-22") return "slot_21_22";
    if (choice === "22-23") return "slot_22_23";
    return "slot_23_00";
}

function formatSummaryMessage(dayView) {
    return (
        `**Presenze ${dayView.date}**\n` +
        `Totale roster: **${dayView.summary.totalMembers}**\n` +
        `Presenti almeno una fascia: **${dayView.summary.anyPresenceCount}**\n` +
        `Full presence: **${dayView.summary.fullPresenceCount}**\n` +
        `Assenti: **${dayView.summary.absentCount}**\n` +
        `21-22: **${dayView.summary.slot21Count}** | 22-23: **${dayView.summary.slot22Count}** | 23-00: **${dayView.summary.slot23Count}**`
    );
}

function formatDetailedRecap(dayView) {
    const lines = dayView.entries.map(entry => {
        const r1 = Number(entry.slot_21_22) === 1 ? "✅" : "❌";
        const r2 = Number(entry.slot_22_23) === 1 ? "✅" : "❌";
        const r3 = Number(entry.slot_23_00) === 1 ? "✅" : "❌";
        return `• ${entry.label} — 21 ${r1} | 22 ${r2} | 23 ${r3} | ${entry.status}`;
    });

    const message = `${formatSummaryMessage(dayView)}\n\n${lines.join("\n")}`;
    return message.length <= 1900
        ? message
        : `${formatSummaryMessage(dayView)}\n\nLista troppo lunga per Discord.`;
}

module.exports = {
    isAttendanceCommand,
    handleAttendanceSlashCommand,
    handleAttendanceComponent,
};
