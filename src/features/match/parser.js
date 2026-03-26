function normalizeLine(text) {
  return text.replace(/^[•>\-\s]+/, '').replace(/\s+/g, ' ').trim();
}

function isDateLine(line) {
  return /(lun|mar|mer|gio|ven|sab|dom|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i.test(
    normalizeLine(line)
  );
}

function isTimeLine(line) {
  return /^\d{1,2}:\d{2}$/.test(normalizeLine(line));
}

function isResultLine(line) {
  return /^results?\s*:/i.test(normalizeLine(line));
}

function isMapLine(line) {
  const parts = normalizeLine(line)
    .split('/')
    .map(part => part.trim());
  return parts.length === 3;
}

function cleanResult(line) {
  return normalizeLine(line).replace(/^results?/i, 'Result');
}

function parseMatchMessage(content) {
  const lines = (content || '')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);

  let title = '';
  let dateLine = '';
  let timeLine = '';
  let resultLine = '';
  const mapLines = [];

  for (const line of lines) {
    if (!title && /\bvs\b/i.test(line)) {
      title = line;
      continue;
    }

    if (!dateLine && isDateLine(line)) {
      dateLine = line;
      continue;
    }

    if (!timeLine && isTimeLine(line)) {
      timeLine = line;
      continue;
    }

    if (!resultLine && isResultLine(line)) {
      resultLine = cleanResult(line);
      continue;
    }

    if (isMapLine(line)) {
      mapLines.push(line);
    }
  }

  return { title, dateLine, timeLine, resultLine, mapLines };
}

module.exports = {
  parseMatchMessage,
  normalizeLine,
};
