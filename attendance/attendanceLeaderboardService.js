const dayjs = require("dayjs");
const {
    getAttendanceLeaderboardRows,
    getAttendanceSummaryRange,
} = require("./attendanceRepository");

function getRangeFromType(type) {
    const today = dayjs();

    if (type === "mese") {
        return {
            startDate: today.startOf("month").format("YYYY-MM-DD"),
            endDate: today.endOf("month").format("YYYY-MM-DD"),
            subtitle: "Classifica Mensile",
            periodLabel: today.format("MM/YYYY"),
        };
    }

    const weekStart = today.startOf("week").add(1, "day");
    const normalizedStart = today.day() === 0
        ? today.startOf("week").subtract(6, "day")
        : weekStart;

    const normalizedEnd = normalizedStart.add(6, "day");

    return {
        startDate: normalizedStart.format("YYYY-MM-DD"),
        endDate: normalizedEnd.format("YYYY-MM-DD"),
        subtitle: "Classifica Settimanale",
        periodLabel: `${normalizedStart.format("DD/MM/YYYY")} - ${normalizedEnd.format("DD/MM/YYYY")}`,
    };
}

async function getAttendanceLeaderboard(type = "settimana") {
    const range = getRangeFromType(type);

    const rows = await getAttendanceLeaderboardRows(range.startDate, range.endDate);
    const summary = await getAttendanceSummaryRange(range.startDate, range.endDate);

    const normalizedRows = rows.map((row, index) => {
        const totalSlots = Number(row.total_slots || 0);
        const coveredSlots = Number(row.slots_covered || 0);
        const presenceRate = totalSlots > 0
            ? Math.round((coveredSlots / totalSlots) * 100)
            : 0;

        return {
            rank: index + 1,
            discordUserId: row.discord_user_id,
            label: row.nickname || row.display_name,
            slotsCovered: coveredSlots,
            daysPresent: Number(row.days_present || 0),
            fullDays: Number(row.full_days || 0),
            presenceRate,
        };
    });

    return {
        type,
        subtitle: range.subtitle,
        periodLabel: range.periodLabel,
        rows: normalizedRows,
        summary: {
            totalMembers: Number(summary.total_members || 0),
            avgSlotsCovered: Number(summary.avg_slots_covered || 0).toFixed(1),
            slot21Top: Number(summary.slot_21_22_top || 0),
            slot22Top: Number(summary.slot_22_23_top || 0),
            slot23Top: Number(summary.slot_23_00_top || 0),
        },
    };
}

module.exports = {
    getAttendanceLeaderboard,
};
