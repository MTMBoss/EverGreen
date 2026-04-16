const { AttachmentBuilder } = require("discord.js");
const { getAttendanceLeaderboard } = require("./attendanceLeaderboardService");
const { renderAttendanceLeaderboardImage } = require("./attendanceLeaderboardRenderer");

async function publishAttendanceLeaderboard(interaction, type) {
    const leaderboard = await getAttendanceLeaderboard(type);
    const imageBuffer = await renderAttendanceLeaderboardImage(leaderboard);

    const attachment = new AttachmentBuilder(imageBuffer, {
        name: "attendance-leaderboard.png",
    });

    await interaction.editReply({
        content: `✅ Leaderboard presenze generata (${leaderboard.subtitle.toLowerCase()}).`,
        files: [attachment],
    });
}

module.exports = {
    publishAttendanceLeaderboard,
};
