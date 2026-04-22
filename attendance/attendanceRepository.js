const { pool, ensureDbReady } = require("./db");

async function syncTrackedMembers(members, syncedAt) {
  await ensureDbReady();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const activeIds = [];

    for (const member of members) {
      const upsertResult = await client.query(
        `
        INSERT INTO members (
          discord_user_id,
          nickname,
          display_name,
          ingame_name,
          tracked_roles_json,
          active,
          last_synced_at
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        ON CONFLICT (discord_user_id) DO UPDATE SET
          nickname = EXCLUDED.nickname,
          display_name = EXCLUDED.display_name,
          tracked_roles_json = EXCLUDED.tracked_roles_json,
          active = TRUE,
          last_synced_at = EXCLUDED.last_synced_at
        RETURNING id
        `,
        [
          member.discord_user_id,
          member.nickname || "",
          member.display_name,
          member.ingame_name || "",
          JSON.stringify(member.tracked_roles || []),
          syncedAt,
        ]
      );

      const memberId = upsertResult.rows[0].id;
      activeIds.push(member.discord_user_id);

      await client.query(
        `
        INSERT INTO member_roster_periods (member_id, joined_at, left_at)
        SELECT $1, $2, NULL
        WHERE NOT EXISTS (
          SELECT 1
          FROM member_roster_periods
          WHERE member_id = $1
            AND left_at IS NULL
        )
        `,
        [memberId, syncedAt]
      );
    }

    await client.query(
      `
      UPDATE member_roster_periods p
      SET left_at = $1
      FROM members m
      WHERE p.member_id = m.id
        AND p.left_at IS NULL
        AND NOT (m.discord_user_id = ANY($2::text[]))
      `,
      [syncedAt, activeIds]
    );

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
    ORDER BY LOWER(COALESCE(NULLIF(ingame_name, ''), NULLIF(nickname, ''), display_name)) ASC
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
    WHERE EXISTS (
      SELECT 1
      FROM member_roster_periods p
      WHERE p.member_id = m.id
        AND DATE(p.joined_at AT TIME ZONE 'Europe/Rome') <= $3::date
        AND (
          p.left_at IS NULL
          OR DATE(p.left_at AT TIME ZONE 'Europe/Rome') > $3::date
        )
    )
    ON CONFLICT (day_id, member_id) DO NOTHING
    `,
    [day.id, nowIso, date]
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
      m.ingame_name,
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
      m.ingame_name,
      m.tracked_roles_json
    FROM attendance_entries ae
    JOIN attendance_days ad ON ad.id = ae.day_id
    JOIN members m ON m.id = ae.member_id
    WHERE ad.day_date = $1
      AND (
        EXISTS (
          SELECT 1
          FROM member_roster_periods p
          WHERE p.member_id = m.id
            AND DATE(p.joined_at AT TIME ZONE 'Europe/Rome') <= ad.day_date
            AND (
              p.left_at IS NULL
              OR DATE(p.left_at AT TIME ZONE 'Europe/Rome') > ad.day_date
            )
        )
        OR COALESCE(ae.updated_by_discord_user_id, '') <> ''
      )
    ORDER BY LOWER(COALESCE(NULLIF(m.ingame_name, ''), NULLIF(m.nickname, ''), m.display_name)) ASC
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
      AND (
        EXISTS (
          SELECT 1
          FROM member_roster_periods p
          WHERE p.member_id = m.id
            AND DATE(p.joined_at AT TIME ZONE 'Europe/Rome') <= ad.day_date
            AND (
              p.left_at IS NULL
              OR DATE(p.left_at AT TIME ZONE 'Europe/Rome') > ad.day_date
            )
        )
        OR COALESCE(ae.updated_by_discord_user_id, '') <> ''
      )
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

async function updateMemberInGameName(discordUserId, ingameName) {
  await ensureDbReady();

  await pool.query(
    `
    UPDATE members
    SET ingame_name = $2
    WHERE discord_user_id = $1
    `,
    [discordUserId, String(ingameName || "").trim()]
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
      AND (
        EXISTS (
          SELECT 1
          FROM member_roster_periods p
          WHERE p.member_id = m.id
            AND DATE(p.joined_at AT TIME ZONE 'Europe/Rome') <= ad.day_date
            AND (
              p.left_at IS NULL
              OR DATE(p.left_at AT TIME ZONE 'Europe/Rome') > ad.day_date
            )
        )
        OR COALESCE(ae.updated_by_discord_user_id, '') <> ''
      )
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

async function getAttendanceLeaderboardRows(startDate, endDate) {
  await ensureDbReady();

  const result = await pool.query(
    `
    SELECT
      m.discord_user_id,
      m.nickname,
      m.display_name,
      COUNT(DISTINCT ad.day_date) FILTER (
        WHERE ae.slot_21_22 OR ae.slot_22_23 OR ae.slot_23_00
      )::int AS days_present,
      COUNT(DISTINCT ad.day_date) FILTER (
        WHERE ae.slot_21_22 AND ae.slot_22_23 AND ae.slot_23_00
      )::int AS full_days,
      (
        COALESCE(SUM(CASE WHEN ae.slot_21_22 THEN 1 ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN ae.slot_22_23 THEN 1 ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN ae.slot_23_00 THEN 1 ELSE 0 END), 0)
      )::int AS slots_covered,
      (COUNT(DISTINCT ad.day_date) * 3)::int AS total_slots
    FROM attendance_entries ae
    JOIN attendance_days ad ON ad.id = ae.day_id
    JOIN members m ON m.id = ae.member_id
    WHERE ad.day_date BETWEEN $1 AND $2
      AND EXISTS (
        SELECT 1
        FROM member_roster_periods p
        WHERE p.member_id = m.id
          AND DATE(p.joined_at) <= ad.day_date
          AND (p.left_at IS NULL OR DATE(p.left_at) > ad.day_date)
      )
    GROUP BY
      m.discord_user_id,
      m.nickname,
      m.display_name
    ORDER BY
      slots_covered DESC,
      full_days DESC,
      days_present DESC,
      LOWER(COALESCE(NULLIF(m.ingame_name, ''), NULLIF(m.nickname, ''), m.display_name)) ASC
    LIMIT 10
    `,
    [startDate, endDate]
  );

  return result.rows;
}

async function getAttendanceSummaryRange(startDate, endDate) {
  await ensureDbReady();

  const result = await pool.query(
    `
    WITH range_entries AS (
      SELECT
        ae.member_id,
        ad.day_date,
        ae.slot_21_22,
        ae.slot_22_23,
        ae.slot_23_00
      FROM attendance_entries ae
      JOIN attendance_days ad ON ad.id = ae.day_id
      JOIN members m ON m.id = ae.member_id
      WHERE ad.day_date BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1
          FROM member_roster_periods p
          WHERE p.member_id = m.id
            AND DATE(p.joined_at) <= ad.day_date
            AND (p.left_at IS NULL OR DATE(p.left_at) > ad.day_date)
        )
    )
    SELECT
      COUNT(DISTINCT member_id)::int AS total_members,
      ROUND(AVG(
        (CASE WHEN slot_21_22 THEN 1 ELSE 0 END) +
        (CASE WHEN slot_22_23 THEN 1 ELSE 0 END) +
        (CASE WHEN slot_23_00 THEN 1 ELSE 0 END)
      )::numeric, 1) AS avg_slots_covered,
      COALESCE(MAX(slot21_count), 0)::int AS slot_21_22_top,
      COALESCE(MAX(slot22_count), 0)::int AS slot_22_23_top,
      COALESCE(MAX(slot23_count), 0)::int AS slot_23_00_top
    FROM (
      SELECT
        member_id,
        day_date,
        slot_21_22,
        slot_22_23,
        slot_23_00,
        SUM(CASE WHEN slot_21_22 THEN 1 ELSE 0 END) OVER () AS slot21_count,
        SUM(CASE WHEN slot_22_23 THEN 1 ELSE 0 END) OVER () AS slot22_count,
        SUM(CASE WHEN slot_23_00 THEN 1 ELSE 0 END) OVER () AS slot23_count
      FROM range_entries
    ) t
    `,
    [startDate, endDate]
  );

  return (
    result.rows[0] || {
      total_members: 0,
      avg_slots_covered: 0,
      slot_21_22_top: 0,
      slot_22_23_top: 0,
      slot_23_00_top: 0,
    }
  );
}

module.exports = {
  syncTrackedMembers,
  getMemberByDiscordId,
  getActiveMembers,
  updateMemberInGameName,
  ensureAttendanceDay,
  upsertAttendanceEntry,
  getAttendanceEntryByMemberAndDate,
  getAttendanceForDate,
  getAttendanceSummaryForDate,
  getMonthSummary,
  getAttendanceLeaderboardRows,
  getAttendanceSummaryRange,
};
