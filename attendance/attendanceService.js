const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
require("dayjs/locale/it");

dayjs.extend(customParseFormat);
dayjs.locale("it");

const { ensureDbReady } = require("./db");
const {
    getMemberByDiscordId,
    getActiveMembers,
    ensureAttendanceDay,
    upsertAttendanceEntry,
    getAttendanceEntryByMemberAndDate,
    getAttendanceForDate,
    getAttendanceSummaryForDate,
    getMonthSummary,
} = require("./attendanceRepository");

const VALID_SLOTS = new Set(["slot_21_22", "slot_22_23", "slot_23_00"]);

function initializeAttendance() {
    ensureDbReady().catch(error => {
        console.error("❌ Errore inizializzazione DB presenze:", error);
    });
}

function getTodayIsoDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function normalizeDateInput(input) {
    if (!input) return getTodayIsoDate();

    const parsed = dayjs(input, "YYYY-MM-DD", true);
    if (!parsed.isValid()) {
        throw new Error("La data deve essere nel formato YYYY-MM-DD.");
    }

    return parsed.format("YYYY-MM-DD");
}

function nowIso() {
    return new Date().toISOString();
}

async function ensureDate(dateInput) {
    const date = normalizeDateInput(dateInput);
    await ensureAttendanceDay(date, nowIso());
    return date;
}

async function getMemberOrThrow(discordUserId) {
    const member = await getMemberByDiscordId(discordUserId);

    if (!member) {
        throw new Error(
            "Utente non presente nel roster tracciato. Esegui prima /presenze-sync oppure controlla i ruoli presenze."
        );
    }

    return member;
}

async function setSingleSlot({
    dateInput,
    discordUserId,
    slot,
    value,
    updatedByDiscordUserId,
}) {
    if (!VALID_SLOTS.has(slot)) {
        throw new Error("Fascia non valida.");
    }

    const date = await ensureDate(dateInput);
    const member = await getMemberOrThrow(discordUserId);

    const current =
        (await getAttendanceEntryByMemberAndDate(date, discordUserId)) ||
        makeEmptyEntry(member.id, discordUserId);

    const updated = {
        date,
        memberId: member.id,
        slot_21_22: current.slot_21_22,
        slot_22_23: current.slot_22_23,
        slot_23_00: current.slot_23_00,
        notes: current.notes || "",
        updated_by_discord_user_id: updatedByDiscordUserId || "",
        updated_at: nowIso(),
    };

    updated[slot] = value ? 1 : 0;

    await upsertAttendanceEntry(updated);
    return getDayView(date);
}

async function setDaySlots({
    dateInput,
    discordUserId,
    slot_21_22,
    slot_22_23,
    slot_23_00,
    notes,
    updatedByDiscordUserId,
}) {
    const date = await ensureDate(dateInput);
    const member = await getMemberOrThrow(discordUserId);

    await upsertAttendanceEntry({
        date,
        memberId: member.id,
        slot_21_22: slot_21_22 ? 1 : 0,
        slot_22_23: slot_22_23 ? 1 : 0,
        slot_23_00: slot_23_00 ? 1 : 0,
        notes: notes || "",
        updated_by_discord_user_id: updatedByDiscordUserId || "",
        updated_at: nowIso(),
    });

    return getDayView(date);
}

async function getDayView(dateInput) {
    const date = await ensureDate(dateInput);

    const entries = (await getAttendanceForDate(date)).map(entry => ({
        ...entry,
        label: entry.nickname || entry.display_name,
        status: getStatusLabel(entry),
    }));

    const summary = await getAttendanceSummaryForDate(date);

    return {
        date,
        entries,
        summary: {
            totalMembers: Number(summary.total_members || 0),
            slot21Count: Number(summary.slot_21_22_count || 0),
            slot22Count: Number(summary.slot_22_23_count || 0),
            slot23Count: Number(summary.slot_23_00_count || 0),
            anyPresenceCount: Number(summary.any_presence_count || 0),
            fullPresenceCount: Number(summary.full_presence_count || 0),
            absentCount: Number(summary.absent_count || 0),
        },
    };
}

async function getCalendarView(monthInput) {
    const month =
        monthInput && dayjs(monthInput, "YYYY-MM", true).isValid()
            ? dayjs(monthInput, "YYYY-MM", true)
            : dayjs(getTodayIsoDate(), "YYYY-MM-DD", true);

    const start = month.startOf("month").format("YYYY-MM-DD");
    const end = month.endOf("month").format("YYYY-MM-DD");

    const rows = await getMonthSummary(start, end);

    const map = new Map(
        rows.map(row => [
            row.day_date,
            {
                totalMembers: Number(row.total_members || 0),
                slot21Count: Number(row.slot_21_22_count || 0),
                slot22Count: Number(row.slot_22_23_count || 0),
                slot23Count: Number(row.slot_23_00_count || 0),
                anyPresenceCount: Number(row.any_presence_count || 0),
                fullPresenceCount: Number(row.full_presence_count || 0),
                absentCount: Number(row.absent_count || 0),
            },
        ])
    );

    return {
        month: month.format("YYYY-MM"),
        title: month.format("MMMM YYYY"),
        start,
        end,
        summaryByDate: map,
    };
}

async function getTrackedRoster() {
    return (await getActiveMembers()).map(member => ({
        ...member,
        label: member.nickname || member.display_name,
    }));
}

function getStatusLabel(entry) {
    const a = Number(entry.slot_21_22) === 1;
    const b = Number(entry.slot_22_23) === 1;
    const c = Number(entry.slot_23_00) === 1;

    if (a && b && c) return "Presente";
    if (!a && !b && !c) return "Assente";
    return "Parziale";
}

function makeEmptyEntry(memberId, discordUserId) {
    return {
        member_id: memberId,
        discord_user_id: discordUserId,
        slot_21_22: 0,
        slot_22_23: 0,
        slot_23_00: 0,
        notes: "",
    };
}

module.exports = {
    initializeAttendance,
    normalizeDateInput,
    getTodayIsoDate,
    ensureDate,
    setSingleSlot,
    setDaySlots,
    getDayView,
    getCalendarView,
    getTrackedRoster,
    getStatusLabel,
};
