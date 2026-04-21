const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
} = require("discord.js");

const {
    readConfig,
    writeConfig,
} = require("../config/configStore");

const { getTodayIsoDate } = require("./attendanceService");
const { getAttendanceLeaderboard } = require("./attendanceLeaderboardService");
const { renderAttendanceLeaderboardImage } = require("./attendanceLeaderboardRenderer");

const SELECT_ID = "attendance_lb_select";
const BUTTON_PREFIX = "attendance_lb_btn";

function getStoredLeaderboardConfig() {
    const config = readConfig();
    return {
        channelId: config.attendanceLeaderboardChannel || "",
        messageId: config.attendanceLeaderboardMessageId || "",
        defaultType: config.attendanceLeaderboardDefaultType || "settimana",
    };
}

function setStoredLeaderboardConfig(patch) {
    const config = readConfig();

    config.attendanceLeaderboardChannel =
        patch.channelId !== undefined
            ? patch.channelId
            : (config.attendanceLeaderboardChannel || "");

    config.attendanceLeaderboardMessageId =
        patch.messageId !== undefined
            ? patch.messageId
            : (config.attendanceLeaderboardMessageId || "");

    config.attendanceLeaderboardDefaultType =
        patch.defaultType !== undefined
            ? patch.defaultType
            : (config.attendanceLeaderboardDefaultType || "settimana");

    writeConfig(config);
}

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
        .setColor("#7c3aed")
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
                    label: "Oggi",
                    value: "oggi",
                    description: "Classifica del giorno",
                    default: type === "oggi",
                },
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

    const firstRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}:oggi`)
            .setLabel("Oggi")
            .setStyle(type === "oggi" ? ButtonStyle.Primary : ButtonStyle.Secondary),

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
            .setStyle(ButtonStyle.Success)
    );

    const components = [selectRow, firstRow];

    if (panelUrl) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Apri pannello")
                    .setStyle(ButtonStyle.Link)
                    .setURL(panelUrl)
            )
        );
    }

    return {
        embeds: [embed],
        files: [attachment],
        components,
    };
}

async function publishAttendanceLeaderboard(interaction, type = "settimana") {
    const payload = await buildLeaderboardMessage(type);
    await interaction.editReply(payload);
}

async function handleAttendanceLeaderboardComponent(interaction) {
    try {
        if (interaction.isStringSelectMenu() && interaction.customId === SELECT_ID) {
            const type = interaction.values[0] || "settimana";

            await interaction.deferUpdate();
            const payload = await buildLeaderboardMessage(type);
            await interaction.editReply(payload);
            return true;
        }

        if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
            const [, action, value] = interaction.customId.split(":");

            let type = "settimana";

            if (action === "oggi") type = "oggi";
            else if (action === "settimana") type = "settimana";
            else if (action === "mese") type = "mese";
            else if (action === "refresh") type = value || "settimana";

            await interaction.deferUpdate();
            const payload = await buildLeaderboardMessage(type);
            await interaction.editReply(payload);
            return true;
        }

        return false;
    } catch (error) {
        console.error("❌ Errore component leaderboard:", error);

        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.reply({
                    content: "❌ Errore aggiornando la leaderboard.",
                    flags: 64,
                });
            } catch { }
        }

        return true;
    }
}

async function setAttendanceLeaderboardChannel(channelId, defaultType = "settimana") {
    setStoredLeaderboardConfig({
        channelId,
        defaultType,
    });
}

async function publishPersistentAttendanceLeaderboard(client, guild, forcedType = null) {
    const stored = getStoredLeaderboardConfig();

    if (!stored.channelId) {
        throw new Error("Canale leaderboard presenze non configurato.");
    }

    const channel = await client.channels.fetch(stored.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error("Canale leaderboard non trovato o non testuale.");
    }

    if (guild && channel.guildId !== guild.id) {
        throw new Error("Il canale leaderboard configurato non appartiene a questa guild.");
    }

    const type = forcedType || stored.defaultType || "settimana";
    const payload = await buildLeaderboardMessage(type);

    if (stored.messageId) {
        const existingMessage = await channel.messages.fetch(stored.messageId).catch(() => null);

        if (existingMessage) {
            await existingMessage.edit(payload);

            setStoredLeaderboardConfig({
                channelId: channel.id,
                messageId: existingMessage.id,
                defaultType: type,
            });

            return {
                channel,
                messageId: existingMessage.id,
                updated: true,
                type,
            };
        }
    }

    const sent = await channel.send(payload);

    setStoredLeaderboardConfig({
        channelId: channel.id,
        messageId: sent.id,
        defaultType: type,
    });

    return {
        channel,
        messageId: sent.id,
        updated: false,
        type,
    };
}

module.exports = {
    publishAttendanceLeaderboard,
    handleAttendanceLeaderboardComponent,
    setAttendanceLeaderboardChannel,
    publishPersistentAttendanceLeaderboard,
};
