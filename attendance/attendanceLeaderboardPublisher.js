const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const { readConfig } = require("../configStore");
const { getTodayIsoDate } = require("./attendanceService");
const { getAttendanceLeaderboard } = require("./attendanceLeaderboardService");
const { renderAttendanceLeaderboardImage } = require("./attendanceLeaderboardRenderer");

const SELECT_ID = "attendance_lb_select";
const BUTTON_PREFIX = "attendance_lb_btn";

async function buildLeaderboardMessage(type = "settimana") {
    const leaderboard = await getAttendanceLeaderboard(type);
    const imageBuffer = await renderAttendanceLeaderboardImage(leaderboard);

    const attachment = new AttachmentBuilder(imageBuffer, {
        name: "attendance-leaderboard.png",
    });

    const config = readConfig();
    const panelUrl = config.attendanceWebBaseUrl
        ? `${config.attendanceWebBaseUrl}/presenze?date=${getTodayIsoDate()}`
        : null;

    const embed = new EmbedBuilder()
        .setTitle("📊 Leaderboard Presenze")
        .setDescription(
            `Visualizzazione **${leaderboard.subtitle}**\nPeriodo: **${leaderboard.periodLabel}**`
        )
        .addFields(
            {
                name: "Roster attivo",
                value: String(leaderboard.summary.totalMembers || 0),
                inline: true,
            },
            {
                name: "Media slot coperti",
                value: String(leaderboard.summary.avgSlotsCovered || 0),
                inline: true,
            },
            {
                name: "Top fascia 21-22",
                value: String(leaderboard.summary.slot21Top || 0),
                inline: true,
            },
            {
                name: "Top fascia 22-23",
                value: String(leaderboard.summary.slot22Top || 0),
                inline: true,
            },
            {
                name: "Top fascia 23-00",
                value: String(leaderboard.summary.slot23Top || 0),
                inline: true,
            },
            {
                name: "Aggiornamento",
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            }
        )
        .setImage("attachment://attendance-leaderboard.png")
        .setFooter({
            text: "EverGreen • Attendance Leaderboard",
        });

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(SELECT_ID)
            .setPlaceholder("Scegli visualizzazione")
            .addOptions([
                {
                    label: "Settimana",
                    value: "settimana",
                    description: "Classifica settimanale",
                    default: type === "settimana",
                },
                {
                    label: "Mese",
                    value: "mese",
                    description: "Classifica mensile",
                    default: type === "mese",
                },
            ])
    );

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:settimana`)
            .setLabel("Settimana")
            .setStyle(type === "settimana" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:mese`)
            .setLabel("Mese")
            .setStyle(type === "mese" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:refresh:${type}`)
            .setLabel("Aggiorna")
            .setStyle(ButtonStyle.Success),
    ];

    if (panelUrl) {
        buttons.push(
            new ButtonBuilder()
                .setLabel("Apri pannello")
                .setStyle(ButtonStyle.Link)
                .setURL(panelUrl)
        );
    }

    const buttonRow = new ActionRowBuilder().addComponents(buttons);

    return {
        embeds: [embed],
        files: [attachment],
        components: [selectRow, buttonRow],
    };
}

async function publishAttendanceLeaderboard(interaction, type = "settimana") {
    const payload = await buildLeaderboardMessage(type);
    await interaction.editReply(payload);
}

async function handleAttendanceLeaderboardComponent(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === SELECT_ID) {
        const type = interaction.values[0] || "settimana";
        const payload = await buildLeaderboardMessage(type);
        await interaction.update(payload);
        return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
        const [, action, value] = interaction.customId.split(":");

        let type = "settimana";

        if (action === "settimana") type = "settimana";
        else if (action === "mese") type = "mese";
        else if (action === "refresh") type = value || "settimana";

        const payload = await buildLeaderboardMessage(type);
        await interaction.update(payload);
        return true;
    }

    return false;
}

module.exports = {
    publishAttendanceLeaderboard,
    handleAttendanceLeaderboardComponent,
};
