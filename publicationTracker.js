const {
  getChannelPublicationState,
  setChannelPublicationState,
} = require("./configStore");

const MONTHS = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11,
};

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractMatchDate(dateLine) {
  const raw = normalizeText(dateLine);

  const match = raw.match(
    /(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)?\s*(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/
  );

  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2];
  const monthIndex = MONTHS[monthName];

  if (monthIndex === undefined) return null;

  const now = new Date();
  let year = now.getFullYear();

  const candidate = new Date(year, monthIndex, day, 12, 0, 0, 0);

  if (candidate.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    year += 1;
  }

  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getIsoWeekKey(date) {
  const temp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getSeparatorActions(channelId, matchDate) {
  const current = getChannelPublicationState(channelId);
  const monthKey = getMonthKey(matchDate);
  const weekKey = getIsoWeekKey(matchDate);

  const monthChanged = current.lastMonthKey !== monthKey;
  const weekChanged = current.lastWeekKey !== weekKey;

  return {
    monthChanged,
    weekChanged,
    monthKey,
    weekKey,
  };
}

function commitSeparatorState(channelId, matchDate) {
  setChannelPublicationState(channelId, {
    lastMonthKey: getMonthKey(matchDate),
    lastWeekKey: getIsoWeekKey(matchDate),
  });
}

module.exports = {
  extractMatchDate,
  getSeparatorActions,
  commitSeparatorState,
};
