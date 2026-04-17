const express = require("express");
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
require("dayjs/locale/it");

dayjs.extend(customParseFormat);
dayjs.locale("it");

const {
  getTodayIsoDate,
  normalizeDateInput,
  getDayView,
  getCalendarView,
  setDaySlots,
} = require("../attendance/attendanceService");
const { syncRosterFromGuild } = require("../attendance/rosterService");
const { readConfig } = require("../configStore");
const {
  getMatchDetailBySlug,
  getMatchList,
  updateMatchManualData,
  removeMatchById,
} = require("../matches/matchService");

function createWebRouter(client) {
  const router = express.Router();

  router.get("/", requireAdmin, (req, res) => {
    res.redirect(`/presenze?date=${getTodayIsoDate()}`);
  });

  router.get("/login", (req, res) => {
    res.render("login", {
      error: req.query.error ? "Token non valido." : "",
    });
  });

  router.post("/login", (req, res) => {
    const submitted = String(req.body.token || "").trim();
    const expected = process.env.WEB_ADMIN_TOKEN || "";

    if (!expected || submitted !== expected) {
      res.redirect("/login?error=1");
      return;
    }

    res.cookie("attendance_admin_token", expected, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/",
    });

    res.redirect(`/presenze?date=${getTodayIsoDate()}`);
  });

  router.get("/logout", (req, res) => {
    res.clearCookie("attendance_admin_token", { path: "/" });
    res.redirect("/login");
  });

  router.get(
    "/presenze",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const date = normalizeDateInput(req.query.date || getTodayIsoDate());
      const dayView = await getDayView(date);
      const config = readConfig();

      res.render("attendance-day", {
        pageTitle: `Presenze ${date}`,
        date,
        dayView,
        saved: req.query.saved === "1",
        syncCount: Number(req.query.sync || 0),
        webBaseUrl: config.attendanceWebBaseUrl || "",
        attendanceChannel: config.attendanceChannel || "",
        currentSection: "presenze",
      });
    })
  );

  router.post(
    "/presenze/:date/save-all",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const date = normalizeDateInput(req.params.date);
      const membersPayload = req.body.members || {};
      const memberIds = Object.keys(membersPayload);

      for (const discordUserId of memberIds) {
        const row = membersPayload[discordUserId] || {};

        await setDaySlots({
          dateInput: date,
          discordUserId,
          slot_21_22: Boolean(row.slot_21_22),
          slot_22_23: Boolean(row.slot_22_23),
          slot_23_00: Boolean(row.slot_23_00),
          notes: String(row.note || "").trim(),
          updatedByDiscordUserId: "WEB_PANEL",
        });
      }

      res.redirect(`/presenze?date=${date}&saved=1`);
    })
  );

  router.get(
    "/calendario",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const month =
        req.query.month && dayjs(req.query.month, "YYYY-MM", true).isValid()
          ? req.query.month
          : dayjs(getTodayIsoDate(), "YYYY-MM-DD", true).format("YYYY-MM");

      const calendarView = await getCalendarView(month);
      const grid = buildCalendarGrid(month, calendarView.summaryByDate);

      res.render("attendance-summary", {
        pageTitle: `Calendario presenze ${month}`,
        month,
        calendarView,
        grid,
        prevMonth: dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM"),
        nextMonth: dayjs(`${month}-01`).add(1, "month").format("YYYY-MM"),
        currentSection: "calendario",
      });
    })
  );

  router.get(
    "/matches",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const matches = await getMatchList();

      res.render("matches-list", {
        pageTitle: "Match",
        matches,
        currentSection: "matches",
      });
    })
  );

  router.get(
    "/matches/:slug",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const match = await getMatchDetailBySlug(req.params.slug);

      if (!match) {
        res.status(404).send("Match non trovato.");
        return;
      }

      const mapsWithPlayers = match.maps.map(map => ({
        ...map,
        team1Players: match.players.filter(
          player =>
            player.order_index === map.order_index &&
            player.team_name === match.team1
        ),
        team2Players: match.players.filter(
          player =>
            player.order_index === map.order_index &&
            player.team_name === match.team2
        ),
      }));

      res.render("match-detail", {
        pageTitle: `${match.team1} vs ${match.team2}`,
        saved: req.query.saved === "1",
        match: {
          ...match,
          mapsWithPlayers,
        },
        currentSection: "matches",
      });
    })
  );

  router.post(
    "/matches/:slug/save",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const match = await getMatchDetailBySlug(req.params.slug);

      if (!match) {
        res.status(404).send("Match non trovato.");
        return;
      }

      await updateMatchManualData(match.id, {
        resultLabel: String(req.body.result_label || "").trim(),
        winnerTeam: String(req.body.winner_team || "").trim(),
        team1SeriesScore: parseNullableInteger(req.body.team1_series_score),
        team2SeriesScore: parseNullableInteger(req.body.team2_series_score),
        needsReview: Boolean(req.body.needs_review),
        maps: normalizeMapFormPayload(req.body.maps),
      });

      res.redirect(`/matches/${match.slug}?saved=1`);
    })
  );

  router.post(
    "/matches/:slug/delete",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const match = await getMatchDetailBySlug(req.params.slug);

      if (!match) {
        res.status(404).send("Match non trovato.");
        return;
      }

      await removeMatchById(match.id);
      res.redirect("/matches");
    })
  );

  router.post(
    "/sync-roster",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const guild =
        client.guilds.cache.get(process.env.GUILD_ID) ||
        client.guilds.cache.first() ||
        null;

      if (!guild) {
        throw new Error("Il bot non è ancora pronto o la guild non è disponibile.");
      }

      const result = await syncRosterFromGuild(guild);
      res.redirect(`/presenze?date=${getTodayIsoDate()}&saved=1&sync=${result.count}`);
    })
  );

  router.use((error, _req, res, _next) => {
    console.error("❌ Errore web:", error);
    res.status(500).send(`Errore: ${error.message}`);
  });

  return router;
}

function requireAdmin(req, res, next) {
  const expected = process.env.WEB_ADMIN_TOKEN || "";
  const cookieToken = req.cookies?.attendance_admin_token || "";
  const queryToken = String(req.query.token || "").trim();

  if (expected && (cookieToken === expected || queryToken === expected)) {
    return next();
  }

  res.redirect("/login");
}

function buildCalendarGrid(month, summaryByDate) {
  const monthStart = dayjs(`${month}-01`, "YYYY-MM-DD", true).startOf("month");
  const daysInMonth = monthStart.daysInMonth();
  const firstDayIndex = (monthStart.day() + 6) % 7;
  const cells = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = monthStart.date(day).format("YYYY-MM-DD");
    cells.push({
      day,
      date,
      summary: summaryByDate.get(date) || null,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return rows;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseNullableInteger(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeMapFormPayload(mapsPayload) {
  if (!mapsPayload || typeof mapsPayload !== "object") return [];

  return Object.entries(mapsPayload)
    .map(([orderIndex, row]) => ({
      orderIndex: Number(orderIndex),
      team1Score: parseNullableInteger(row?.team1_score),
      team2Score: parseNullableInteger(row?.team2_score),
      mode: String(row?.mode || "").trim(),
      mapName: String(row?.map_name || "").trim(),
      sideName: String(row?.side_name || "").trim(),
    }))
    .filter(map => Number.isInteger(map.orderIndex) && map.orderIndex > 0);
}

module.exports = {
  createWebRouter,
};
