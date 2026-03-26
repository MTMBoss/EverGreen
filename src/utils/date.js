function formatDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function getNextMondayWeek(baseDate = new Date()) {
  const day = baseDate.getDay();
  let daysUntilNextMonday = (8 - day) % 7;
  if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;

  const nextMonday = new Date(baseDate);
  nextMonday.setDate(baseDate.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(nextMonday);
    date.setDate(nextMonday.getDate() + i);
    return date;
  });
}

function getCurrentWeekMonday(baseDate = new Date()) {
  const jsDay = baseDate.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;

  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

function getTodayScheduleIndex(baseDate = new Date()) {
  const jsDay = baseDate.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

module.exports = {
  formatDate,
  formatISODate,
  getNextMondayWeek,
  getCurrentWeekMonday,
  getTodayScheduleIndex,
};
