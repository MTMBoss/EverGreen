const { ChannelType } = require("discord.js");
const { readConfig } = require("../configStore");
const { getDayView } = require("./attendanceService");

function buildAttendanceMessages({ date, entries, summary, baseUrl }) {
    const headerLines = [
        `## Presenze ${date}`,
        `Totale roster: **${summary.totalMembers}**`,
        `Presenti almeno in una fascia: **${summary.anyPresenceCount}**`,
        `Full presence: **${summary.fullPresenceCount}**`,
        `Assenti: **${summary.absentCount}**`,
        `21-22: **${summary.slot21Count}** | 22-23: **${summary.slot22Count}** | 23-00: **${summary.slot23Count}**`,
    ];

    if (baseUrl) {
        headerLines.push(`Pannello web: ${baseUrl}/presenze?date=${date}`);
    }

    const entryLines = entries.map((entry, index) => {
        const name = entry.label;
        const r1 = Number(entry.slot_21_22) === 1 ? "✅" : "❌";
        const r2 = Number(entry.slot_22_23) === 1 ? "✅" : "❌";
        const r3 = Number(entry.slot_23_00) === 1 ? "✅" : "❌";
        return `${index + 1}. ${name} — 21 ${r1} | 22 ${r2} | 23 ${r3} | ${entry.status}`;
    });

    const messages = [];
    let current = headerLines.join("\n") + "\n\n";

    for (const line of entryLines) {
        if ((current + line + "\n").length > 1800) {
            messages.push(current.trim());
            current = `## Presenze ${date} (continua)\n\n`;
        }

        current += `${line}\n`;
    }

    if (current.trim()) {
        messages.push(current.trim());
    }

    return messages;
}

async function publishAttendanceForDate(client, guild, dateInput, options = {}) {
    const config = readConfig();
    const targetChannelId = options.targetChannelId || config.attendanceChannel;

    if (!targetChannelId) {
        throw new Error("Canale presenze non configurato. Usa /set-canale-presenze.");
    }

    const channel = await client.channels.fetch(targetChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error("Canale presenze non trovato o non testuale.");
    }

    if (guild && channel.guildId !== guild.id) {
        throw new Error("Il canale presenze configurato non appartiene a questa guild.");
    }

    const dayView = await getDayView(dateInput);

    const messages = buildAttendanceMessages({
        ...dayView,
        baseUrl: config.attendanceWebBaseUrl || "",
    });

    for (const content of messages) {
        await channel.send({ content });
    }

    return { channel, dayView, messageCount: messages.length };
}

module.exports = {
    buildAttendanceMessages,
    publishAttendanceForDate,
};
