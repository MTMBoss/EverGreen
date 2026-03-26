function buildPart1Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.timeLine) lines.push(`• ${data.timeLine}`);

  if (data.mapLines.length > 0) {
    lines.push('');
    for (const map of data.mapLines) lines.push(map);
  }

  lines.push('');
  return lines.join('\n');
}

function buildPart2Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.resultLine) lines.push(`• ${data.resultLine}`);

  return lines.join('\n');
}

function buildPart2Draft(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  lines.push('• Result:');

  return lines.join('\n');
}

module.exports = {
  buildPart1Message,
  buildPart2Message,
  buildPart2Draft,
};
