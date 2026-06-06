function normalizeLine(text) {
  return (text || "").replace(/^[•>\-\s]+/, "").replace(/\s+/g, " ").trim();
}

function isDateLine(line) {
  const clean = normalizeLine(line);

  return (
    /(lun|mar|mer|gio|ven|sab|dom|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i.test(clean) ||
    /^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/.test(clean) ||
    /^\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)$/i.test(clean) ||
    /^(lun|mar|mer|gio|ven|sab|dom)\s+\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)$/i.test(clean) ||
    /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)$/i.test(clean)
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
  return parts.length === 3;
}

function cleanResult(line) {
  return normalizeLine(line).replace(/^results?/i, "Result");
}

function parseMatchMessage(content) {
  const lines = (content || "")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  let title = "";
  let dateLine = "";
  let timeLine = "";
  let resultLine = "";
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

function buildPart1Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.timeLine) lines.push(`• ${data.timeLine}`);

  if (data.mapLines.length > 0) {
    lines.push("");
    for (const map of data.mapLines) lines.push(map);
  }

  lines.push("");
  return lines.join("\n");
}

function buildPart2Message(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  if (data.resultLine) lines.push(`• ${data.resultLine}`);

  return lines.join("\n");
}

function buildPart2Draft(data) {
  const lines = [];

  if (data.title) lines.push(`• ${data.title}`);
  if (data.dateLine) lines.push(`• ${data.dateLine}`);
  lines.push("• Result:");

  return lines.join("\n");
}

function getImageAttachments(message) {
  return [...message.attachments.values()].filter(attachment =>
    attachment.contentType?.startsWith("image/")
  );
}

module.exports = {
  buildPart1Message,
  buildPart2Draft,
  buildPart2Message,
  getImageAttachments,
  parseMatchMessage,
};
