const { pool, ensureDbReady } = require("./db");

async function syncTrackedMembers(members, syncedAt) {
  await ensureDbReady();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const member of members) {
      await client.query(
        `
        INSERT INTO members (
          discord_user_id,
          nickname,
          display_name,
          tracked_roles_json,
          active,
          last_synced_at
        )
        VALUES ($1, $2, $3, $4, TRUE, $5)
        ON CONFLICT (discord_user_id) DO UPDATE SET
          nickname = EXCLUDED.nickname,
          display_name = EXCLUDED.display_name,
          tracked_roles_json = EXCLUDED.tracked_roles_json,
          active = TRUE,
          last_synced_at = EXCLUDED.last_synced_at
        `,
        [
          member.discord_user_id,
          member.nickname || "",
          member.display_name,
          JSON.stringify(member.tracked_roles || []),
          syncedAt,
        ]
      );
    }

    const activeIds = members.map(member => member.discord_user_id);

    await client.query(
      `
      UPDATE members
      SET active = FALSE
      WHERE NOT (discord_user_id = ANY($1::text[]))
      `,
      [activeIds]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getMemberByDiscordId(discordUserId) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT *
    FROM members
    WHERE discord_user_id = $1
    LIMIT 1
    `,
    [discordUserId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...row,
    tracked_roles: safeParseRoles(row.tracked_roles_json),
  };
}

async function getActiveMembers() {
  await ensureDbReady();

  const result = await pool.query(`
    SELECT *
    FROM members
    WHERE active = TRUE
    ORDER BY LOWER(COALESCE(NULLIF(nickname, ''), display_name)) ASC
  `);

  return result.rows.map(row => ({
    ...row,
    tracked_roles: safeParseRoles(row.tracked_roles_json),
  }));
}

async function ensureAttendanceDay(date, nowIso) {
  await ensureDbReady();

  await pool.query(
    `
    INSERT INTO attendance_days (day_date)
    VALUES ($1)
    ON CONFLICT (day_date) DO NOTHING
    `,
    [date]
  );

  const dayResult = await pool.query(
    `
    SELECT *
    FROM attendance_days
    WHERE day_date = $1
    LIMIT 1
    `,
    [date]
  );

  const day = dayResult.rows[0];

  await pool.query(
    `
    INSERT INTO attendance_entries (
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
      $1,
      m.id,
      FALSE,
      FALSE,
      FALSE,
      '',
      '',
      $2
    FROM members m
    WHERE m.active = TRUE
    ON CONFLICT (day_id, member_id) DO NOTHING
    `,
    [day.id, nowIso]
  );

  return day;
}

async function upsertAttendanceEntry({
  date,
  memberId,
  slot_21_22,
  slot_22_23,
  slot_23_00,
  notes,
  updated_by_discord_user_id,
  updated_at,
}) {
  await ensureDbReady();

  const day = await ensureAttendanceDay(date, updated_at);

  await pool.query(
    `
    INSERT INTO attendance_entries (
      day_id,
      member_id,
      slot_21_22,
      slot_22_23,
      slot_23_00,
      notes,
      updated_by_discord_user_id,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (day_id, member_id) DO UPDATE SET
      slot_21_22 = EXCLUDED.slot_21_22,
      slot_22_23 = EXCLUDED.slot_22_23,
      slot_23_00 = EXCLUDED.slot_23_00,
      notes = EXCLUDED.notes,
      updated_by_discord_user_id = EXCLUDED.updated_by_discord_user_id,
      updated_at = EXCLUDED.updated_at
    `,
    [
      day.id,
      memberId,
      Boolean(slot_21_22),
      Boolean(slot_22_23),
      Boolean(slot_23_00),
      notes || "",
      updated_by_discord_user_id || "",
      updated_at,
    ]
  );
}

async function getAttendanceEntryByMemberAndDate(date, discordUserId) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT
      ae.id,
      ae.day_id,
      ae.member_id,
      CASE WHEN ae.slot_21_22 THEN 1 ELSE 0 END AS slot_21_22,
      CASE WHEN ae.slot_22_23 THEN 1 ELSE 0 END AS slot_22_23,
      CASE WHEN ae.slot_23_00 THEN 1 ELSE 0 END AS slot_23_00,
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
    WHERE ad.day_date = $1
      AND m.discord_user_id = $2
    LIMIT 1
    `,
    [date, discordUserId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...row,
    tracked_roles: safeParseRoles(row.tracked_roles_json),
  };
}

async function getAttendanceForDate(date) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT
      ae.id,
      ae.member_id,
      CASE WHEN ae.slot_21_22 THEN 1 ELSE 0 END AS slot_21_22,
      CASE WHEN ae.slot_22_23 THEN 1 ELSE 0 END AS slot_22_23,
      CASE WHEN ae.slot_23_00 THEN 1 ELSE 0 END AS slot_23_00,
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
    WHERE ad.day_date = $1
      AND m.active = TRUE
    ORDER BY LOWER(COALESCE(NULLIF(m.nickname, ''), m.display_name)) ASC
    `,
    [date]
  );

  return result.rows.map(row => ({
    ...row,
    tracked_roles: safeParseRoles(row.tracked_roles_json),
  }));
}

async function getAttendanceSummaryForDate(date) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_members,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 THEN 1 ELSE 0 END), 0)::int AS slot_21_22_count,
      COALESCE(SUM(CASE WHEN ae.slot_22_23 THEN 1 ELSE 0 END), 0)::int AS slot_22_23_count,
      COALESCE(SUM(CASE WHEN ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS slot_23_00_count,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 OR ae.slot_22_23 OR ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS any_presence_count,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 AND ae.slot_22_23 AND ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS full_presence_count,
      COALESCE(SUM(CASE WHEN NOT ae.slot_21_22 AND NOT ae.slot_22_23 AND NOT ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS absent_count
    FROM attendance_entries ae
    JOIN attendance_days ad ON ad.id = ae.day_id
    JOIN members m ON m.id = ae.member_id
    WHERE ad.day_date = $1
      AND m.active = TRUE
    `,
    [date]
  );

  return (
    result.rows[0] || {
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

async function getMonthSummary(startDate, endDate) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT
      ad.day_date::text AS day_date,
      COUNT(*)::int AS total_members,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 THEN 1 ELSE 0 END), 0)::int AS slot_21_22_count,
      COALESCE(SUM(CASE WHEN ae.slot_22_23 THEN 1 ELSE 0 END), 0)::int AS slot_22_23_count,
      COALESCE(SUM(CASE WHEN ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS slot_23_00_count,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 OR ae.slot_22_23 OR ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS any_presence_count,
      COALESCE(SUM(CASE WHEN ae.slot_21_22 AND ae.slot_22_23 AND ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS full_presence_count,
      COALESCE(SUM(CASE WHEN NOT ae.slot_21_22 AND NOT ae.slot_22_23 AND NOT ae.slot_23_00 THEN 1 ELSE 0 END), 0)::int AS absent_count
    FROM attendance_days ad
    JOIN attendance_entries ae ON ae.day_id = ad.id
    JOIN members m ON m.id = ae.member_id
    WHERE ad.day_date BETWEEN $1 AND $2
      AND m.active = TRUE
    GROUP BY ad.day_date
    ORDER BY ad.day_date ASC
    `,
    [startDate, endDate]
  );

  return result.rows;
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
