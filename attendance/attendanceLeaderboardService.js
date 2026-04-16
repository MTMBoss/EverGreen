const dayjs = require("dayjs");
const {
    getAttendanceLeaderboardRows,
    getAttendanceSummaryRange,
} = require("./attendanceRepository");

function getTodayRange() {
    const today = dayjs().format("YYYY-MM-DD");

    return {
        startDate: today,
        endDate: today,
        subtitle: "Classifica Giornaliera",
        periodLabel: dayjs(today).format("DD/MM/YYYY"),
    };
}

function getWeekRange() {
    const now = dayjs();
    const jsDay = now.day();
    const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;

    const start = now.add(diffToMonday, "day");
    const end = start.add(6, "day");

    return {
        startDate: start.format("YYYY-MM-DD"),
        endDate: end.format("YYYY-MM-DD"),
        subtitle: "Classifica Settimanale",
        periodLabel: `${start.format("DD/MM/YYYY")} - ${end.format("DD/MM/YYYY")}`,
    };
}

function getMonthRange() {
    const now = dayjs();

    return {
        startDate: now.startOf("month").format("YYYY-MM-DD"),
        endDate: now.endOf("month").format("YYYY-MM-DD"),
        subtitle: "Classifica Mensile",
        periodLabel: now.format("MM/YYYY"),
    };
}

function getRangeFromType(type) {
    if (type === "oggi") return getTodayRange();
    if (type === "mese") return getMonthRange();
    return getWeekRange();
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
