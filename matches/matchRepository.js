const { pool } = require("../attendance/db");

async function createMatchTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      team1 TEXT NOT NULL,
      team2 TEXT NOT NULL,
      match_date DATE NULL,
      match_time TEXT NULL,
      result_label TEXT NOT NULL DEFAULT '',
      winner_team TEXT NOT NULL DEFAULT '',
      team1_series_score INTEGER NULL,
      team2_series_score INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      source_guild_id TEXT NOT NULL DEFAULT '',
      source_channel_id_part1 TEXT NOT NULL DEFAULT '',
      source_message_id_part1 TEXT NOT NULL DEFAULT '',
      source_channel_id_part2 TEXT NOT NULL DEFAULT '',
      source_message_id_part2 TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_maps (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT '',
      map_name TEXT NOT NULL DEFAULT '',
      side_name TEXT NOT NULL DEFAULT '',
      team1_score INTEGER NULL,
      team2_score INTEGER NULL,
      UNIQUE(match_id, order_index)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_players (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      match_map_id INTEGER NULL REFERENCES match_maps(id) ON DELETE CASCADE,
      team_name TEXT NOT NULL DEFAULT '',
      player_name TEXT NOT NULL DEFAULT '',
      kills INTEGER NULL,
      deaths INTEGER NULL,
      assists INTEGER NULL,
      points INTEGER NULL,
      impact INTEGER NULL,
      is_mvp BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_assets (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL DEFAULT '',
      asset_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source_message_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_match_date
    ON matches (match_date DESC, id DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_status
    ON matches (status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_maps_match_id
    ON match_maps (match_id, order_index)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_players_match_id
    ON match_players (match_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_assets_match_id
    ON match_assets (match_id, sort_order)
  `);
}

async function createDraftMatch(input) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const insertMatch = await client.query(
      `
      INSERT INTO matches (
        slug,
        team1,
        team2,
        match_date,
        match_time,
        result_label,
        winner_team,
        team1_series_score,
        team2_series_score,
        status,
        needs_review,
        source_guild_id,
        source_channel_id_part1,
        source_message_id_part1,
        notes
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',FALSE,$10,$11,$12,$13
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        team1 = EXCLUDED.team1,
        team2 = EXCLUDED.team2,
        match_date = EXCLUDED.match_date,
        match_time = EXCLUDED.match_time,
        result_label = EXCLUDED.result_label,
        winner_team = EXCLUDED.winner_team,
        team1_series_score = EXCLUDED.team1_series_score,
        team2_series_score = EXCLUDED.team2_series_score,
        status = 'draft',
        source_guild_id = EXCLUDED.source_guild_id,
        source_channel_id_part1 = EXCLUDED.source_channel_id_part1,
        source_message_id_part1 = EXCLUDED.source_message_id_part1,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
      `,
      [
        input.slug,
        input.team1,
        input.team2,
        input.matchDate,
        input.matchTime,
        input.resultLabel || "",
        input.winnerTeam || "",
        input.team1SeriesScore,
        input.team2SeriesScore,
        input.sourceGuildId || "",
        input.sourceChannelIdPart1 || "",
        input.sourceMessageIdPart1 || "",
        input.notes || "",
      ]
    );

    const match = insertMatch.rows[0];

    await client.query(`DELETE FROM match_maps WHERE match_id = $1`, [match.id]);

    for (const map of input.maps || []) {
      await client.query(
        `
        INSERT INTO match_maps (
          match_id, order_index, mode, map_name, side_name, team1_score, team2_score
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          match.id,
          map.orderIndex,
          map.mode || "",
          map.map || "",
          map.side || "",
          map.team1Score ?? null,
          map.team2Score ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    return match;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findMatchForPart2({ team1, team2, matchDate }) {
  const params = [team1, team2, matchDate || null];

  let result = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE status = 'draft'
      AND (
        (team1 = $1 AND team2 = $2)
        OR
        (team1 = $2 AND team2 = $1)
      )
      AND (
        $3::date IS NULL
        OR match_date = $3::date
        OR match_date IS NULL
      )
    ORDER BY
      CASE WHEN match_date = $3::date THEN 0 ELSE 1 END,
      updated_at DESC,
      created_at DESC
    LIMIT 1
    `,
    params
  );

  if (result.rows[0]) return result.rows[0];

  result = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE (
        (team1 = $1 AND team2 = $2)
        OR
        (team1 = $2 AND team2 = $1)
      )
      AND (
        $3::date IS NULL
        OR match_date = $3::date
        OR match_date IS NULL
      )
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      CASE WHEN match_date = $3::date THEN 0 ELSE 1 END,
      updated_at DESC,
      created_at DESC
    LIMIT 1
    `,
    params
  );

  if (result.rows[0]) return result.rows[0];

  result = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE (
        (team1 = $1 AND team2 = $2)
        OR
        (team1 = $2 AND team2 = $1)
      )
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      updated_at DESC,
      created_at DESC
    LIMIT 1
    `,
    [team1, team2]
  );

  return result.rows[0] || null;
}

async function findMatchBySourceMessage({ part, sourceChannelId, sourceMessageId }) {
  const channelColumn =
    part === 2 ? "source_channel_id_part2" : "source_channel_id_part1";
  const messageColumn =
    part === 2 ? "source_message_id_part2" : "source_message_id_part1";

  const result = await pool.query(
    `
    SELECT *
    FROM matches
    WHERE ${channelColumn} = $1
      AND ${messageColumn} = $2
    LIMIT 1
    `,
    [sourceChannelId || "", sourceMessageId || ""]
  );

  return result.rows[0] || null;
}

async function attachPart2ToMatch(matchId, payload) {
  await pool.query(
    `
    UPDATE matches
    SET
      source_channel_id_part2 = $2,
      source_message_id_part2 = $3,
      result_label = COALESCE(NULLIF($4, ''), result_label),
      winner_team = COALESCE(NULLIF($5, ''), winner_team),
      team1_series_score = COALESCE($6, team1_series_score),
      team2_series_score = COALESCE($7, team2_series_score),
      needs_review = $8,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      matchId,
      payload.sourceChannelIdPart2 || "",
      payload.sourceMessageIdPart2 || "",
      payload.resultLabel || "",
      payload.winnerTeam || "",
      payload.team1SeriesScore ?? null,
      payload.team2SeriesScore ?? null,
      Boolean(payload.needsReview),
    ]
  );
}

async function replaceMatchAssets(matchId, assets) {
  await pool.query(
    `DELETE FROM match_assets WHERE match_id = $1 AND asset_type = 'screenshot'`,
    [matchId]
  );

  for (const asset of assets || []) {
    await pool.query(
      `
      INSERT INTO match_assets (match_id, asset_type, asset_url, sort_order, source_message_id)
      VALUES ($1, 'screenshot', $2, $3, $4)
      `,
      [matchId, asset.url, asset.sortOrder || 0, asset.sourceMessageId || ""]
    );
  }
}

async function replaceMatchMapScores(matchId, maps) {
  if (!Array.isArray(maps) || maps.length === 0) return;

  for (const map of maps) {
    await pool.query(
      `
      UPDATE match_maps
      SET
        team1_score = COALESCE($3, team1_score),
        team2_score = COALESCE($4, team2_score),
        mode = CASE WHEN $5 <> '' THEN $5 ELSE mode END,
        map_name = CASE WHEN $6 <> '' THEN $6 ELSE map_name END,
        side_name = CASE WHEN $7 <> '' THEN $7 ELSE side_name END
      WHERE match_id = $1
        AND order_index = $2
      `,
      [
        matchId,
        map.orderIndex,
        map.team1Score ?? null,
        map.team2Score ?? null,
        map.mode || "",
        map.map || "",
        map.side || "",
      ]
    );
  }
}

async function replaceMatchPlayers(matchId, players) {
  await pool.query(`DELETE FROM match_players WHERE match_id = $1`, [matchId]);

  for (const player of players || []) {
    await pool.query(
      `
      INSERT INTO match_players (
        match_id,
        match_map_id,
        team_name,
        player_name,
        kills,
        deaths,
        assists,
        points,
        impact,
        is_mvp
      )
      VALUES (
        $1,
        (
          SELECT id
          FROM match_maps
          WHERE match_id = $1
            AND order_index = $2
          LIMIT 1
        ),
        $3,$4,$5,$6,$7,$8,$9,$10
      )
      `,
      [
        matchId,
        player.orderIndex || null,
        player.teamName || "",
        player.playerName || "",
        player.kills ?? null,
        player.deaths ?? null,
        player.assists ?? null,
        player.points ?? null,
        player.impact ?? null,
        Boolean(player.isMvp),
      ]
    );
  }
}

async function markMatchPublished(matchId, needsReview = false) {
  await pool.query(
    `
    UPDATE matches
    SET
      status = 'published',
      needs_review = $2,
      updated_at = NOW()
    WHERE id = $1
    `,
    [matchId, Boolean(needsReview)]
  );
}

async function getMatchBySlug(slug) {
  const matchResult = await pool.query(
    `SELECT * FROM matches WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  const match = matchResult.rows[0];
  if (!match) return null;

  const mapsResult = await pool.query(
    `
    SELECT *
    FROM match_maps
    WHERE match_id = $1
    ORDER BY order_index ASC
    `,
    [match.id]
  );

  const playersResult = await pool.query(
    `
    SELECT
      p.*,
      m.order_index
    FROM match_players p
    LEFT JOIN match_maps m ON m.id = p.match_map_id
    WHERE p.match_id = $1
    ORDER BY m.order_index ASC NULLS LAST, p.team_name ASC, p.points DESC NULLS LAST, p.player_name ASC
    `,
    [match.id]
  );

  const assetsResult = await pool.query(
    `
    SELECT *
    FROM match_assets
    WHERE match_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [match.id]
  );

  return {
    ...match,
    maps: mapsResult.rows,
    players: playersResult.rows,
    assets: assetsResult.rows,
  };
}

async function listMatches() {
  const result = await pool.query(
    `
    SELECT
      id,
      slug,
      team1,
      team2,
      match_date,
      match_time,
      result_label,
      winner_team,
      team1_series_score,
      team2_series_score,
      status,
      needs_review,
      created_at,
      updated_at
    FROM matches
    ORDER BY match_date DESC NULLS LAST, created_at DESC
    `
  );

  return result.rows;
}

async function updateMatchSummary(matchId, payload) {
  await pool.query(
    `
    UPDATE matches
    SET
      result_label = $2,
      winner_team = $3,
      team1_series_score = $4,
      team2_series_score = $5,
      needs_review = $6,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      matchId,
      payload.resultLabel || "",
      payload.winnerTeam || "",
      payload.team1SeriesScore,
      payload.team2SeriesScore,
      Boolean(payload.needsReview),
    ]
  );
}

async function updateMatchMaps(matchId, maps) {
  for (const map of maps || []) {
    await pool.query(
      `
      UPDATE match_maps
      SET
        team1_score = $3,
        team2_score = $4,
        mode = $5,
        map_name = $6,
        side_name = $7
      WHERE match_id = $1
        AND order_index = $2
      `,
      [
        matchId,
        map.orderIndex,
        map.team1Score,
        map.team2Score,
        map.mode || "",
        map.mapName || "",
        map.sideName || "",
      ]
    );
  }
}

async function deleteMatchById(matchId) {
  await pool.query(`DELETE FROM matches WHERE id = $1`, [matchId]);
}

module.exports = {
  createMatchTables,
  createDraftMatch,
  findMatchForPart2,
  findMatchBySourceMessage,
  attachPart2ToMatch,
  replaceMatchAssets,
  replaceMatchMapScores,
  replaceMatchPlayers,
  markMatchPublished,
  getMatchBySlug,
  listMatches,
  updateMatchSummary,
  updateMatchMaps,
  deleteMatchById,
};
