const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDate,
  formatISODate,
  getCurrentWeekMonday,
  getTodayScheduleIndex,
} = require('../src/utils/date');

test('date utilities format and resolve weekdays correctly', () => {
  const sunday = new Date('2026-03-29T10:00:00Z');
  const monday = getCurrentWeekMonday(sunday);

  assert.equal(formatDate(new Date('2026-03-04T10:00:00Z')), '04/03');
  assert.equal(formatISODate(new Date('2026-03-04T10:00:00Z')), '2026-03-04');
  assert.equal(formatISODate(monday), '2026-03-23');
  assert.equal(getTodayScheduleIndex(sunday), 6);
});
