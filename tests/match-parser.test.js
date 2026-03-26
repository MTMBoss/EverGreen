const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMatchMessage } = require('../src/features/match/parser');

test('parseMatchMessage extracts title, date, time, maps and result', () => {
  const input = [
    'MTM VS Rivali',
    'Mercoledì',
    '21:00',
    'Mirage / 13-8 / W',
    'Inferno / 13-10 / W',
    'Result: 2-0',
  ].join('\n');

  const parsed = parseMatchMessage(input);

  assert.equal(parsed.title, 'MTM VS Rivali');
  assert.equal(parsed.dateLine, 'Mercoledì');
  assert.equal(parsed.timeLine, '21:00');
  assert.equal(parsed.resultLine, 'Result: 2-0');
  assert.deepEqual(parsed.mapLines, ['Mirage / 13-8 / W', 'Inferno / 13-10 / W']);
});
