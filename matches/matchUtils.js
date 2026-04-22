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

function parseItalianDate(dateLine, options = {}) {
    const clean = normalizeLine(dateLine)
        .replace(/[📅]/g, "")
        .replace(/\./g, "")
        .trim();

    if (!clean) return null;

    const normalized = clean
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const referenceDate = options.referenceDate
        ? dayjs(options.referenceDate)
        : dayjs();

    const currentYear = referenceDate.isValid()
        ? referenceDate.year()
        : dayjs().year();

    const weekdays = [
        "lunedi",
        "martedi",
        "mercoledi",
        "giovedi",
        "venerdi",
        "sabato",
        "domenica",
        "lun",
        "mar",
        "mer",
        "gio",
        "ven",
        "sab",
        "dom",
    ];

    let value = normalized;

    for (const weekday of weekdays) {
        if (value.startsWith(`${weekday} `)) {
            value = value.slice(weekday.length).trim();
            break;
        }
    }

    const months = {
        gennaio: "01",
        febbraio: "02",
        marzo: "03",
        aprile: "04",
        maggio: "05",
        giugno: "06",
        luglio: "07",
        agosto: "08",
        settembre: "09",
        ottobre: "10",
        novembre: "11",
        dicembre: "12",
    };

    const textMatch = value.match(
        /^(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{2,4}))?$/
    );

    if (textMatch) {
        const day = textMatch[1].padStart(2, "0");
        const month = months[textMatch[2]];
        let year = textMatch[3] || String(currentYear);

        if (year.length === 2) {
            year = `20${year}`;
        }

        return `${year}-${month}-${day}`;
    }

    const slashMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);

    if (slashMatch) {
        const day = slashMatch[1].padStart(2, "0");
        const month = slashMatch[2].padStart(2, "0");
        let year = slashMatch[3] || String(currentYear);

        if (year.length === 2) {
            year = `20${year}`;
        }

        return `${year}-${month}-${day}`;
    }

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
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

function parseMatchDraftFromParsedMessage(parsed, options = {}) {
    const { team1, team2 } = splitTitle(parsed.title || "");

    const matchDate = parseItalianDate(parsed.dateLine || "", {
        referenceDate: options.referenceDate,
    });
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
