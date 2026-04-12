const { db } = require("./db");

let initialized = false;
let statements = null;

function initAttendanceDb() {
    if (initialized) return;

    db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '',
      display_name TEXT NOT NULL,
      tracked_roles_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_date TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      slot_21_22 INTEGER NOT NULL DEFAULT 0,
      slot_22_23 INTEGER NOT NULL DEFAULT 0,
      slot_23_00 INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      updated_by_discord_user_id TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(day_id, member_id),
      FOREIGN KEY(day_id) REFERENCES attendance_days(id),
      FOREIGN KEY(member_id) REFERENCES members(id)
    );
  `);

    statements = {
        upsertMemberStmt: db.prepare(`
      INSERT INTO members (
        discord_user_id,
        nickname,
        display_name,
        tracked_roles_json,
        active,
        last_synced_at
      ) VALUES (
        @discord_user_id,
        @nickname,
        @display_name,
        @tracked_roles_json,
        1,
        @last_synced_at
      )
      ON CONFLICT(discord_user_id) DO UPDATE SET
        nickname = excluded.nickname,
        display_name = excluded.display_name,
        tracked_roles_json = excluded.tracked_roles_json,
        active = 1,
        last_synced_at = excluded.last_synced_at
    `),

        deactivateMissingStmt: db.prepare(`
      UPDATE members
      SET active = 0
      WHERE discord_user_id NOT IN (SELECT value FROM json_each(?))
    `),

        getMemberByDiscordIdStmt: db.prepare(`
      SELECT *
      FROM members
      WHERE discord_user_id = ?
      LIMIT 1
    `),

        getActiveMembersStmt: db.prepare(`
      SELECT *
      FROM members
      WHERE active = 1
      ORDER BY LOWER(COALESCE(NULLIF(nickname, ''), display_name)) ASC
    `),

        insertAttendanceDayStmt: db.prepare(`
      INSERT OR IGNORE INTO attendance_days (day_date)
      VALUES (?)
    `),

        getAttendanceDayStmt: db.prepare(`
      SELECT *
      FROM attendance_days
      WHERE day_date = ?
      LIMIT 1
    `),

        ensureEntriesForDayStmt: db.prepare(`
      INSERT OR IGNORE INTO attendance_entries (
        day_id,
        member_id,
        slot_21_22,
        slot_22_23,
        slot_23_00,
        notes,
        updated_by_discord_user_id,
        updated_at
      )
      SELECT
        ?,
        m.id,
        0,
        0,
        0,
        '',
        '',
        ?
      FROM members m
      WHERE m.active = 1
    `),

        upsertAttendanceEntryStmt: db.prepare(`
      INSERT INTO attendance_entries (
        day_id,
        member_id,
        slot_21_22,
        slot_22_23,
        slot_23_00,
        notes,
        updated_by_discord_user_id,
        updated_at
      ) VALUES (
        @day_id,
        @member_id,
        @slot_21_22,
        @slot_22_23,
        @slot_23_00,
        @notes,
        @updated_by_discord_user_id,
        @updated_at
      )
      ON CONFLICT(day_id, member_id) DO UPDATE SET
        slot_21_22 = excluded.slot_21_22,
        slot_22_23 = excluded.slot_22_23,
        slot_23_00 = excluded.slot_23_00,
        notes = excluded.notes,
        updated_by_discord_user_id = excluded.updated_by_discord_user_id,
        updated_at = excluded.updated_at
    `),

        getAttendanceEntryByMemberAndDateStmt: db.prepare(`
      SELECT
        ae.*,
        m.discord_user_id,
        m.nickname,
        m.display_name,
        m.tracked_roles_json
      FROM attendance_entries ae
      JOIN attendance_days ad ON ad.id = ae.day_id
      JOIN members m ON m.id = ae.member_id
      WHERE ad.day_date = ?
        AND m.discord_user_id = ?
      LIMIT 1
    `),

        getAttendanceForDateStmt: db.prepare(`
      SELECT
        ae.id,
        ae.member_id,
        ae.slot_21_22,
        ae.slot_22_23,
        ae.slot_23_00,
        ae.notes,
        ae.updated_by_discord_user_id,
        ae.updated_at,
        m.discord_user_id,
        m.nickname,
        m.display_name,
        m.tracked_roles_json
      FROM attendance_entries ae
      JOIN attendance_days ad ON ad.id = ae.day_id
      JOIN members m ON m.id = ae.member_id
      WHERE ad.day_date = ?
        AND m.active = 1
      ORDER BY LOWER(COALESCE(NULLIF(m.nickname, ''), m.display_name)) ASC
    `),

        getAttendanceSummaryForDateStmt: db.prepare(`
      SELECT
        COUNT(*) AS total_members,
        SUM(CASE WHEN slot_21_22 = 1 THEN 1 ELSE 0 END) AS slot_21_22_count,
        SUM(CASE WHEN slot_22_23 = 1 THEN 1 ELSE 0 END) AS slot_22_23_count,
        SUM(CASE WHEN slot_23_00 = 1 THEN 1 ELSE 0 END) AS slot_23_00_count,
        SUM(CASE WHEN slot_21_22 = 1 OR slot_22_23 = 1 OR slot_23_00 = 1 THEN 1 ELSE 0 END) AS any_presence_count,
        SUM(CASE WHEN slot_21_22 = 1 AND slot_22_23 = 1 AND slot_23_00 = 1 THEN 1 ELSE 0 END) AS full_presence_count,
        SUM(CASE WHEN slot_21_22 = 0 AND slot_22_23 = 0 AND slot_23_00 = 0 THEN 1 ELSE 0 END) AS absent_count
      FROM attendance_entries ae
      JOIN attendance_days ad ON ad.id = ae.day_id
      JOIN members m ON m.id = ae.member_id
      WHERE ad.day_date = ?
        AND m.active = 1
    `),

        getMonthSummaryStmt: db.prepare(`
      SELECT
        ad.day_date,
        COUNT(*) AS total_members,
        SUM(CASE WHEN ae.slot_21_22 = 1 THEN 1 ELSE 0 END) AS slot_21_22_count,
        SUM(CASE WHEN ae.slot_22_23 = 1 THEN 1 ELSE 0 END) AS slot_22_23_count,
        SUM(CASE WHEN ae.slot_23_00 = 1 THEN 1 ELSE 0 END) AS slot_23_00_count,
        SUM(CASE WHEN ae.slot_21_22 = 1 OR ae.slot_22_23 = 1 OR ae.slot_23_00 = 1 THEN 1 ELSE 0 END) AS any_presence_count,
        SUM(CASE WHEN ae.slot_21_22 = 1 AND ae.slot_22_23 = 1 AND ae.slot_23_00 = 1 THEN 1 ELSE 0 END) AS full_presence_count,
        SUM(CASE WHEN ae.slot_21_22 = 0 AND ae.slot_22_23 = 0 AND ae.slot_23_00 = 0 THEN 1 ELSE 0 END) AS absent_count
      FROM attendance_days ad
      JOIN attendance_entries ae ON ae.day_id = ad.id
      JOIN members m ON m.id = ae.member_id
      WHERE ad.day_date BETWEEN ? AND ?
        AND m.active = 1
      GROUP BY ad.day_date
      ORDER BY ad.day_date ASC
    `),
    };

    initialized = true;
}

function ensureReady() {
    if (!initialized) {
        initAttendanceDb();
    }
}

function syncTrackedMembers(members, syncedAt) {
    ensureReady();

    const tx = db.transaction(() => {
        const activeIds = [];

        for (const member of members) {
            statements.upsertMemberStmt.run({
                discord_user_id: member.discord_user_id,
                nickname: member.nickname || "",
                display_name: member.display_name,
                tracked_roles_json: JSON.stringify(member.tracked_roles || []),
                last_synced_at: syncedAt,
            });

            activeIds.push(member.discord_user_id);
        }

        statements.deactivateMissingStmt.run(JSON.stringify(activeIds));
    });

    tx();
}

function getMemberByDiscordId(discordUserId) {
    ensureReady();

    const row = statements.getMemberByDiscordIdStmt.get(discordUserId);
    if (!row) return null;

    return {
        ...row,
        tracked_roles: safeParseRoles(row.tracked_roles_json),
    };
}

function getActiveMembers() {
    ensureReady();

    return statements.getActiveMembersStmt.all().map(row => ({
        ...row,
        tracked_roles: safeParseRoles(row.tracked_roles_json),
    }));
}

function ensureAttendanceDay(date, nowIso) {
    ensureReady();

    statements.insertAttendanceDayStmt.run(date);
    const day = statements.getAttendanceDayStmt.get(date);
    statements.ensureEntriesForDayStmt.run(day.id, nowIso);
    return day;
}

function upsertAttendanceEntry({
    date,
    memberId,
    slot_21_22,
    slot_22_23,
    slot_23_00,
    notes,
    updated_by_discord_user_id,
    updated_at,
}) {
    ensureReady();

    const day = ensureAttendanceDay(date, updated_at);

    statements.upsertAttendanceEntryStmt.run({
        day_id: day.id,
        member_id: memberId,
        slot_21_22: slot_21_22 ? 1 : 0,
        slot_22_23: slot_22_23 ? 1 : 0,
        slot_23_00: slot_23_00 ? 1 : 0,
        notes: notes || "",
        updated_by_discord_user_id: updated_by_discord_user_id || "",
        updated_at,
    });
}

function getAttendanceEntryByMemberAndDate(date, discordUserId) {
    ensureReady();

    const row = statements.getAttendanceEntryByMemberAndDateStmt.get(date, discordUserId);
    if (!row) return null;

    return {
        ...row,
        tracked_roles: safeParseRoles(row.tracked_roles_json),
    };
}

function getAttendanceForDate(date) {
    ensureReady();

    return statements.getAttendanceForDateStmt.all(date).map(row => ({
        ...row,
        tracked_roles: safeParseRoles(row.tracked_roles_json),
    }));
}

function getAttendanceSummaryForDate(date) {
    ensureReady();

    return (
        statements.getAttendanceSummaryForDateStmt.get(date) || {
            total_members: 0,
            slot_21_22_count: 0,
            slot_22_23_count: 0,
            slot_23_00_count: 0,
            any_presence_count: 0,
            full_presence_count: 0,
            absent_count: 0,
        }
    );
}

function getMonthSummary(startDate, endDate) {
    ensureReady();
    return statements.getMonthSummaryStmt.all(startDate, endDate);
}

function safeParseRoles(value) {
    try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

module.exports = {
    initAttendanceDb,
    syncTrackedMembers,
    getMemberByDiscordId,
    getActiveMembers,
    ensureAttendanceDay,
    upsertAttendanceEntry,
    getAttendanceEntryByMemberAndDate,
    getAttendanceForDate,
    getAttendanceSummaryForDate,
    getMonthSummary,
};
