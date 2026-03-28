function normalizeLine(text = "") {
  return String(text).replace(/^[•>\-\s]+/, "").replace(/\s+/g, " ").trim();
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
  const parts = normalizeLine(line).split("/").map(part => part.trim());
  return parts.length === 3 && parts.every(Boolean);
}

function cleanResult(line) {
  return normalizeLine(line).replace(/^results?/i, "Result");
}

function parseMatchMessage(content = "") {
  const lines = content
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const parsed = {
    title: "",
    dateLine: "",
    timeLine: "",
    resultLine: "",
    mapLines: [],
  };

  for (const line of lines) {
    if (!parsed.title && /\bvs\b/i.test(line)) {
      parsed.title = line;
      continue;
    }

    if (!parsed.dateLine && isDateLine(line)) {
      parsed.dateLine = line;
      continue;
    }

    if (!parsed.timeLine && isTimeLine(line)) {
      parsed.timeLine = line;
      continue;
    }

    if (!parsed.resultLine && isResultLine(line)) {
      parsed.resultLine = cleanResult(line);
      continue;
    }

    if (isMapLine(line)) {
      parsed.mapLines.push(line);
    }
  }

  return parsed;
}

module.exports = {
  normalizeLine,
  isDateLine,
  isTimeLine,
  isResultLine,
  isMapLine,
  cleanResult,
  parseMatchMessage,
};