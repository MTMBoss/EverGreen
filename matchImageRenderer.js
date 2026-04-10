const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const BACKGROUND_PATH =
  process.env.MATCH_BG_PATH || path.join(__dirname, "assets", "match-bg.png");

const LOGO_PATH =
  process.env.MATCH_LOGO_PATH || path.join(__dirname, "assets", "logo.png");

function normalizeLine(text) {
  return (text || "").replace(/^[•>\-\s]+/, "").replace(/\s+/g, " ").trim();
}

function splitTitle(title) {
  const clean = normalizeLine(title);
  const parts = clean.split(/\s+vs\s+/i);

  return {
    team1: (parts[0] || "Team 1").trim(),
    team2: (parts[1] || "Team 2").trim(),
  };
}

function parseMapLine(line) {
  const parts = normalizeLine(line).split("/").map(p => p.trim());

  return {
    mode: parts[0] || "",
    map: parts[1] || "",
    side: parts[2] || "",
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize, minSize, weight = "bold") {
  let size = startSize;

  while (size >= minSize) {
    ctx.font = `${weight} ${size}px Sans`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }

  return minSize;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    font = "bold 40px Sans",
    fillStyle = "#ffffff",
    textAlign = "center",
    textBaseline = "alphabetic",
    shadowColor = null,
    shadowBlur = 0,
    strokeStyle = null,
    lineWidth = 0,
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  ctx.fillStyle = fillStyle;

  if (shadowColor && shadowBlur > 0) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }

  if (strokeStyle && lineWidth > 0) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.strokeText(text, x, y);
  }

  ctx.fillText(text, x, y);
  ctx.restore();
}

function sideStyle(side) {
  const value = (side || "").toLowerCase();

  if (value === "rosso") {
    return {
      rowFill: "#6d000c",
      rowStroke: "#b43a46",
      badgeStroke: "#ff6774",
      badgeText: "#ff6774",
    };
  }

  return {
    rowFill: "#10296f",
    rowStroke: "#3d70dd",
    badgeStroke: "#5b90ff",
    badgeText: "#5b90ff",
  };
}

async function drawBackground(ctx, width, height) {
  if (fs.existsSync(BACKGROUND_PATH)) {
    const bg = await loadImage(BACKGROUND_PATH);
    ctx.drawImage(bg, 0, 0, width, height);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#22003a");
  gradient.addColorStop(0.45, "#36005f");
  gradient.addColorStop(1, "#12001f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function drawLogo(ctx, width) {
  if (!fs.existsSync(LOGO_PATH)) return;

  const logo = await loadImage(LOGO_PATH);

  const targetWidth = 180;
  const ratio = targetWidth / logo.width;

  const logoWidth = Math.round(logo.width * ratio);
  const logoHeight = Math.round(logo.height * ratio);

  const x = width / 2 - logoWidth / 2;
  const y = 38;

  ctx.save();
  ctx.shadowColor = "#a24cff";
  ctx.shadowBlur = 10;
  ctx.drawImage(logo, x, y, logoWidth, logoHeight);
  ctx.restore();
}

function drawDateTimeGroup(ctx, width, dateText, timeText) {
  const dateFont = "bold 33px Sans";
  const timeFont = "bold 40px Sans";
  const gap = 26;
  const separatorGap = 16;
  const separatorText = "·";
  const y = 625;

  ctx.save();
  ctx.font = dateFont;
  const dateWidth = ctx.measureText(dateText).width;

  ctx.font = "bold 16px Sans";
  const separatorWidth = ctx.measureText(separatorText).width;

  ctx.font = timeFont;
  const timeWidth = ctx.measureText(timeText).width;
  ctx.restore();

  const totalWidth =
    dateWidth + separatorGap + separatorWidth + separatorGap + gap + timeWidth;

  const startX = width / 2 - totalWidth / 2;

  drawText(ctx, dateText, startX, y, {
    font: dateFont,
    fillStyle: "#d6c4ee",
    textAlign: "left",
    shadowColor: "#8d57d1",
    shadowBlur: 2,
  });

  const separatorX = startX + dateWidth + separatorGap;
  drawText(ctx, separatorText, separatorX, y - 1, {
    font: "bold 16px Sans",
    fillStyle: "#9f7fd1",
    textAlign: "left",
    shadowColor: "#8d57d1",
    shadowBlur: 0.5,
  });

  const timeX = startX + dateWidth + separatorGap + separatorWidth + separatorGap + gap;
  drawText(ctx, timeText, timeX, y, {
    font: timeFont,
    fillStyle: "#39ff14",
    textAlign: "left",
    shadowColor: "#2fff00",
    shadowBlur: 3,
  });
}

async function renderMatchImage(parsed) {
  const width = 1080;
  const height = 1920;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx, width, height);

  ctx.fillStyle = "rgba(15, 0, 25, 0.08)";
  ctx.fillRect(0, 0, width, height);

  const { team1, team2 } = splitTitle(parsed.title);
  const maps = parsed.mapLines.slice(0, 3).map(parseMapLine);

  await drawLogo(ctx, width);

  const team1Text = team1.toUpperCase();
  const team2Text = team2.toUpperCase();

  const team1Size = fitText(ctx, team1Text, 760, 96, 60);
  const team2Size = fitText(ctx, team2Text, 560, 88, 54);

  drawText(ctx, team1Text, width / 2, 308, {
    font: `bold ${team1Size}px Sans`,
    fillStyle: "#b56aff",
    shadowColor: "#8a3fff",
    shadowBlur: 7,
    strokeStyle: "#7b38cf",
    lineWidth: 1.1,
  });

  drawText(ctx, "VS", width / 2, 408, {
    font: "bold 58px Sans",
    fillStyle: "#39ff14",
    shadowColor: "#2fff00",
    shadowBlur: 4,
  });

  drawText(ctx, team2Text, width / 2, 530, {
    font: `bold ${team2Size}px Sans`,
    fillStyle: "#dddddd",
    shadowColor: "#ffffff",
    shadowBlur: 2,
    strokeStyle: "#787878",
    lineWidth: 1.1,
  });

  drawDateTimeGroup(
    ctx,
    width,
    parsed.dateLine || "",
    parsed.timeLine || ""
  );

  ctx.save();
  ctx.strokeStyle = "rgba(169, 96, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 700);
  ctx.lineTo(width, 700);
  ctx.stroke();
  ctx.restore();

  const rowX = 42;
  const rowWidth = 996;
  const rowHeight = 124;
  const startY = 740;
  const rowGap = 20;
  const rowRadius = 14;

  maps.forEach((item, index) => {
    const y = startY + index * (rowHeight + rowGap);
    const style = sideStyle(item.side);
    const centerY = y + rowHeight / 2;

    ctx.save();
    roundedRect(ctx, rowX, y, rowWidth, rowHeight, rowRadius);
    ctx.fillStyle = style.rowFill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = style.rowStroke;
    ctx.stroke();
    ctx.restore();

    drawText(ctx, (item.mode || "").toUpperCase(), rowX + 28, centerY + 2, {
      font: "bold 31px Sans",
      fillStyle: "#e4cdf4",
      textAlign: "left",
      textBaseline: "middle",
    });

    const mapText = (item.map || "").toUpperCase();
    const mapSize = fitText(ctx, mapText, 420, 40, 26);

    drawText(ctx, mapText, width / 2, centerY + 2, {
      font: `bold ${mapSize}px Sans`,
      fillStyle: "#ffffff",
      textBaseline: "middle",
      shadowColor: "rgba(255,255,255,0.08)",
      shadowBlur: 1,
    });

    const badgeText = (item.side || "").toUpperCase();
    ctx.font = "bold 23px Sans";
    const badgeWidth = Math.max(
      106,
      Math.min(148, ctx.measureText(badgeText).width + 28)
    );
    const badgeHeight = 42;
    const badgeX = rowX + rowWidth - badgeWidth - 22;
    const badgeY = y + 30;

    ctx.save();
    roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 18);
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.badgeStroke;
    ctx.stroke();
    ctx.restore();

    drawText(ctx, badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1, {
      font: "bold 22px Sans",
      fillStyle: style.badgeText,
      textBaseline: "middle",
    });
  });

  drawText(ctx, "EVG · EVERGREEN GAMING", width / 2, 1830, {
    font: "bold 25px Sans",
    fillStyle: "#8872bb",
    shadowColor: "#846fb6",
    shadowBlur: 1.5,
  });

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderMatchImage,
};