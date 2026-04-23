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
  getTrackedRoster,
  setMemberInGameName,
} = require("../attendance/attendanceService");
const { syncRosterFromGuild } = require("../attendance/rosterService");
const { readConfig, setMatchImportState } = require("../config/configStore");
const {
  getMatchList,
  getMatchDetailBySlug,
  reanalyzeStoredMatchImages,
  setMatchStatusValue,
  removeAllMatches,
} = require("../matches/matchService");
const {
  getScheduleAvailabilityForDate,
  makeEmptyDeclaration,
  countDeclaredSlots,
} = require("../schedule/scheduleAvailabilityService");

function createWebRouter(client) {
  const router = express.Router();

  router.get("/", requireAdmin, (req, res) => {
    res.redirect("/dashboard");
  });

  router.get(
    "/dashboard",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const today = getTodayIsoDate();
      const [dayView, matches] = await Promise.all([
        getDayView(today),
        getMatchList(),
      ]);

      const recentMatches = matches.slice(0, 5);
      const publishedMatches = matches.filter(match => match.status === "published");
      const draftMatches = matches.filter(match => match.status === "draft");

      res.render("dashboard", {
        pageTitle: "EverGreen Dashboard",
        currentSection: "dashboard",
        today,
        dayView,
        recentMatches: recentMatches.map(presentMatchForView),
        stats: {
          totalMatches: matches.length,
          publishedMatches: publishedMatches.length,
          draftMatches: draftMatches.length,
          cancelledMatches: matches.filter(match => match.status === "cancelled").length,
          reviewMatches: matches.filter(match => match.needs_review).length,
        },
      });
    })
  );

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
      const scheduleAvailability = await getScheduleAvailabilityForDate(client, date);
      const config = readConfig();
      const avatarUrls = await getMemberAvatarUrls(
        client,
        dayView.entries.map(entry => entry.discord_user_id)
      );

      const entries = dayView.entries.map(entry => {
        const declaredSchedule =
          scheduleAvailability.byUserId[entry.discord_user_id] || makeEmptyDeclaration();
        const actualSlots = {
          slot_21_22: Number(entry.slot_21_22) === 1,
          slot_22_23: Number(entry.slot_22_23) === 1,
          slot_23_00: Number(entry.slot_23_00) === 1,
        };

        const mismatchCount = ["slot_21_22", "slot_22_23", "slot_23_00"].reduce(
          (count, key) => count + (declaredSchedule[key] !== actualSlots[key] ? 1 : 0),
          0
        );

        return {
          ...entry,
          declaredSchedule,
          declaredSlotCount: countDeclaredSlots(declaredSchedule),
          actualSlotCount: countDeclaredSlots(actualSlots),
          mismatchCount,
          avatarUrl: avatarUrls[entry.discord_user_id] || "",
          syncLabel:
            mismatchCount === 0
              ? "Allineato"
              : countDeclaredSlots(declaredSchedule) > countDeclaredSlots(actualSlots)
                ? "Dichiarato ma non presente"
                : "Presenza extra rispetto allo schedule",
        };
      });

      res.render("attendance-day", {
        pageTitle: `Presenze ${date}`,
        date,
        dayView: {
          ...dayView,
          entries,
        },
        scheduleAvailability,
        saved: req.query.saved === "1",
        syncCount: Number(req.query.sync || 0),
        webBaseUrl: config.attendanceWebBaseUrl || "",
        attendanceChannel: config.attendanceChannel || "",
        currentSection: "presenze",
      });
    })
  );

  router.get(
    "/roster",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const roster = await getTrackedRoster();
      const avatarUrls = await getMemberAvatarUrls(
        client,
        roster.map(member => member.discord_user_id)
      );

      res.render("roster", {
        pageTitle: "Roster EverGreen",
        roster: roster.map(member => ({
          ...member,
          avatarUrl: avatarUrls[member.discord_user_id] || "",
        })),
        saved: req.query.saved === "1",
        currentSection: "roster",
      });
    })
  );

  router.get(
    "/matches",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const matches = await getMatchList();

      res.render("matches", {
        pageTitle: "Match Center",
        matches: matches.map(presentMatchForView),
        rebuilt: _req.query.rebuilt === "1",
        currentSection: "scrim",
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

      const playersByMap = new Map();
      for (const player of match.players || []) {
        const key = player.order_index || 0;
        if (!playersByMap.has(key)) playersByMap.set(key, []);
        playersByMap.get(key).push(player);
      }

      res.render("match-detail", {
        pageTitle: `${match.team1} vs ${match.team2}`,
        match: presentMatchForView(match),
        playersByMap,
        reanalyzed: req.query.reanalyzed === "1",
        saved: req.query.saved === "1",
        currentSection: "scrim",
      });
    })
  );

  router.post(
    "/matches/rebuild",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const config = readConfig();

      await removeAllMatches();
      setMatchImportState({
        version: 0,
        sourceChannelPart1: config.targetChannel1 || "",
        sourceChannelPart2: config.targetChannel2 || "",
        part1Before: "",
        part2Before: "",
        completed: false,
      });

      res.redirect("/matches?rebuilt=1");
    })
  );

  router.post(
    "/matches/:slug/reanalyze",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const match = await getMatchDetailBySlug(req.params.slug);

      if (!match) {
        res.status(404).send("Match non trovato.");
        return;
      }

      await reanalyzeStoredMatchImages(match.id);
      res.redirect(`/matches/${match.slug}?reanalyzed=1`);
    })
  );

  router.post(
    "/matches/:slug/status",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const match = await getMatchDetailBySlug(req.params.slug);

      if (!match) {
        res.status(404).send("Match non trovato.");
        return;
      }

      const action = String(req.body.action || "").trim().toLowerCase();
      let nextStatus = match.status || "draft";

      if (action === "cancel") {
        nextStatus = "cancelled";
      } else if (action === "restore") {
        nextStatus = inferRestoredMatchStatus(match);
      } else {
        throw new Error("Azione stato match non valida.");
      }

      await setMatchStatusValue(match.id, nextStatus);
      res.redirect(`/matches/${match.slug}?saved=1`);
    })
  );

  router.post(
    "/roster/save",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const membersPayload = req.body.members || {};

      for (const discordUserId of Object.keys(membersPayload)) {
        const row = membersPayload[discordUserId] || {};
        await setMemberInGameName(discordUserId, row.ingame_name || "");
      }

      res.redirect("/roster?saved=1");
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
          notes: "",
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

  if (expected && queryToken === expected) {
    res.cookie("attendance_admin_token", expected, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/",
    });
    return next();
  }

  if (expected && cookieToken === expected) {
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

function presentMatchForView(match) {
  return {
    ...match,
    matchDateLabel: formatMatchDateLabel(match?.match_date),
    ...getMatchStatusMeta(match?.status),
  };
}

function getMatchStatusMeta(status) {
  if (status === "published") {
    return {
      statusLabel: "Completo",
      statusTone: "good",
      isCancelled: false,
    };
  }

  if (status === "cancelled") {
    return {
      statusLabel: "Cancellata",
      statusTone: "bad",
      isCancelled: true,
    };
  }

  return {
    statusLabel: "Bozza",
    statusTone: "warn",
    isCancelled: false,
  };
}

function inferRestoredMatchStatus(match) {
  const hasPart2Evidence =
    Boolean(match?.source_message_id_part2) ||
    Boolean(match?.result_label) ||
    match?.team1_series_score !== null ||
    match?.team2_series_score !== null ||
    Array.isArray(match?.assets) && match.assets.length > 0;

  return hasPart2Evidence ? "published" : "draft";
}

function formatMatchDateLabel(value) {
  if (!value) return "";

  if (typeof value === "string" && dayjs(value, "YYYY-MM-DD", true).isValid()) {
    return capitalize(dayjs(value, "YYYY-MM-DD", true).format("dddd D MMMM YYYY"));
  }

  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return capitalize(parsed.format("dddd D MMMM YYYY"));
  }

  return String(value);
}

function capitalize(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function getMemberAvatarUrls(client, discordUserIds) {
  const uniqueIds = Array.from(new Set((discordUserIds || []).filter(Boolean)));
  if (!uniqueIds.length) return {};

  const guild =
    client.guilds.cache.get(process.env.GUILD_ID) ||
    client.guilds.cache.first() ||
    null;

  if (!guild) return {};

  const avatarUrls = {};

  for (const discordUserId of uniqueIds) {
    try {
      const member =
        guild.members.cache.get(discordUserId) ||
        await guild.members.fetch(discordUserId).catch(() => null);

      if (!member) continue;

      avatarUrls[discordUserId] = member.displayAvatarURL({
        extension: "png",
        size: 128,
      });
    } catch {
      avatarUrls[discordUserId] = "";
    }
  }

  return avatarUrls;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  createWebRouter,
};
