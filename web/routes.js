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
        });

        res.redirect(`/presenze?date=${getTodayIsoDate()}`);
    });

    router.get("/logout", (req, res) => {
        res.clearCookie("attendance_admin_token");
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
                webBaseUrl: config.attendanceWebBaseUrl || "",
                attendanceChannel: config.attendanceChannel || "",
            });
        })
    );

    router.post(
        "/presenze/:date/:discordUserId",
        requireAdmin,
        asyncHandler(async (req, res) => {
            const date = normalizeDateInput(req.params.date);
            const slot21 = Boolean(req.body.slot_21_22);
            const slot22 = Boolean(req.body.slot_22_23);
            const slot23 = Boolean(req.body.slot_23_00);
            const note = String(req.body.note || "").trim();

            await setDaySlots({
                dateInput: date,
                discordUserId: req.params.discordUserId,
                slot_21_22: slot21,
                slot_22_23: slot22,
                slot_23_00: slot23,
                notes: note,
                updatedByDiscordUserId: "WEB_PANEL",
            });

            res.redirect(`/presenze?date=${date}&saved=1#member-${req.params.discordUserId}`);
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
            });
        })
    );

    router.post(
        "/sync-roster",
        requireAdmin,
        asyncHandler(async (_req, res) => {
            const guild = client.guilds.cache.get(process.env.GUILD_ID) || null;

            if (!guild) {
                throw new Error("Il bot non è ancora pronto o la guild non è disponibile.");
            }

            const result = await syncRosterFromGuild(guild);
            res.redirect(`/presenze?date=${getTodayIsoDate()}&saved=1&sync=${result.count}`);
        })
    );

    router.use((error, _req, res, _next) => {
        console.error("❌ Errore web presenze:", error);
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

module.exports = {
    createWebRouter,
};
