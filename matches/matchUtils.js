const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
require("dayjs/locale/it");

dayjs.extend(customParseFormat);
dayjs.locale("it");

function normalizeLine(text) {
    return String(text || "")
        .replace(/^[•>\-\s]+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function slugify(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .toLowerCase();
}

function splitTitle(title) {
    const clean = normalizeLine(title);
    const parts = clean.split(/\s+vs\s+/i);

    return {
        team1: (parts[0] || "Team 1").trim(),
        team2: (parts[1] || "Team 2").trim(),
    };
}

function parseItalianDate(dateLine) {
    const clean = normalizeLine(dateLine)
        .replace(/[📅]/g, "")
        .trim();

    const currentYear = dayjs().year();

    const formatsWithYear = [
        "dddd D MMMM YYYY",
        "ddd D MMMM YYYY",
        "D MMMM YYYY",
        "DD/MM/YYYY",
        "D/M/YYYY",
        "YYYY-MM-DD",
    ];

    for (const fmt of formatsWithYear) {
        const parsed = dayjs(clean, fmt, "it", true);
        if (parsed.isValid()) {
            return parsed.format("YYYY-MM-DD");
        }
    }

    const formatsWithoutYear = [
        "dddd D MMMM",
        "ddd D MMMM",
        "D MMMM",
        "DD/MM",
        "D/M",
    ];

    for (const fmt of formatsWithoutYear) {
        const parsed = dayjs(`${clean} ${currentYear}`, `${fmt} YYYY`, "it", true);
        if (parsed.isValid()) {
            return parsed.format("YYYY-MM-DD");
        }
    }

    return null;
}
function parseTime(timeLine) {
    const clean = normalizeLine(timeLine).replace(/[🕒]/g, "").trim();
    const match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseResultLine(resultLine, team1, team2) {
    const clean = normalizeLine(resultLine);
    const m = clean.match(/(\d+)\s*[:\-]\s*(\d+)/);

    if (!m) {
        return {
            team1SeriesScore: null,
            team2SeriesScore: null,
            resultLabel: "",
            winnerTeam: "",
        };
    }

    const team1SeriesScore = Number(m[1]);
    const team2SeriesScore = Number(m[2]);

    let winnerTeam = "";
    let resultLabel = "Pareggio";

    if (team1SeriesScore > team2SeriesScore) {
        winnerTeam = team1;
        resultLabel = "Vittoria";
    } else if (team2SeriesScore > team1SeriesScore) {
        winnerTeam = team2;
        resultLabel = "Sconfitta";
    }

    return {
        team1SeriesScore,
        team2SeriesScore,
        resultLabel,
        winnerTeam,
    };
}

function parseMapLine(line) {
    const parts = normalizeLine(line).split("/").map(item => item.trim());

    return {
        mode: parts[0] || "",
        map: parts[1] || "",
        side: parts[2] || "",
    };
}

function buildMatchSlug({ team1, team2, matchDate }) {
    return `${slugify(team1)}-vs-${slugify(team2)}-${matchDate || "senza-data"}`;
}

function parseMatchDraftFromParsedMessage(parsed) {
    const { team1, team2 } = splitTitle(parsed.title || "");

    const matchDate = parseItalianDate(parsed.dateLine || "");
    const matchTime = parseTime(parsed.timeLine || "");
    const result = parseResultLine(parsed.resultLine || "", team1, team2);

    const maps = Array.isArray(parsed.mapLines)
        ? parsed.mapLines.map((line, index) => ({
            orderIndex: index + 1,
            ...parseMapLine(line),
        }))
        : [];

    return {
        slug: buildMatchSlug({ team1, team2, matchDate }),
        team1,
        team2,
        matchDate,
        matchTime,
        resultLabel: result.resultLabel,
        winnerTeam: result.winnerTeam,
        team1SeriesScore: result.team1SeriesScore,
        team2SeriesScore: result.team2SeriesScore,
        maps,
    };
}

module.exports = {
    normalizeLine,
    slugify,
    splitTitle,
    parseItalianDate,
    parseTime,
    parseResultLine,
    parseMapLine,
    buildMatchSlug,
    parseMatchDraftFromParsedMessage,
};
