const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const BACKGROUND_PATH =
  process.env.MATCH_BG_PATH || path.join(__dirname, "assets", "match-bg.png");

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

function fitText(ctx, text, maxWidth, startSize, minSize, fontWeight = "bold") {
  let size = startSize;

  while (size >= minSize) {
    ctx.font = `${fontWeight} ${size}px Sans`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }

  return minSize;
}

function drawGlowText(ctx, text, x, y, options = {}) {
  const {
    fillStyle = "#ffffff",
    shadowColor = fillStyle,
    shadowBlur = 18,
    textAlign = "center",
    font = "bold 40px Sans",
  } = options;

  ctx.save();
  ctx.textAlign = textAlign;
  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function sideColors(side) {
  const normalized = (side || "").toLowerCase();

  if (normalized === "rosso") {
    return {
      row: "rgba(90, 10, 20, 0.88)",
      border: "rgba(255, 90, 90, 0.65)",
      tag: "#ff6b6b",
    };
  }

  return {
    row: "rgba(10, 28, 90, 0.88)",
    border: "rgba(90, 150, 255, 0.65)",
    tag: "#6fa8ff",
  };
}

async function renderMatchImage(parsed) {
  const width = 1080;
  const height = 1920;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, width, height);

  if (fs.existsSync(BACKGROUND_PATH)) {
    const bg = await loadImage(BACKGROUND_PATH);
    ctx.drawImage(bg, 0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#24003a");
    gradient.addColorStop(0.5, "#3b0066");
    gradient.addColorStop(1, "#070012");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, 0, width, height);

  const { team1, team2 } = splitTitle(parsed.title);
  const maps = parsed.mapLines.slice(0, 3).map(parseMapLine);

  const titleMaxWidth = 760;
  const team1Size = fitText(ctx, team1.toUpperCase(), titleMaxWidth, 92, 54);
  const team2Size = fitText(ctx, team2.toUpperCase(), titleMaxWidth, 92, 54);

  drawGlowText(ctx, team1.toUpperCase(), width / 2, 270, {
    fillStyle: "#c77dff",
    shadowColor: "#b84dff",
    shadowBlur: 26,
    font: `bold ${team1Size}px Sans`,
  });

  drawGlowText(ctx, "VS", width / 2, 385, {
    fillStyle: "#39ff14",
    shadowColor: "#39ff14",
    shadowBlur: 24,
    font: "bold 64px Sans",
  });

  drawGlowText(ctx, team2.toUpperCase(), width / 2, 510, {
    fillStyle: "#f2f2f2",
    shadowColor: "#ffffff",
    shadowBlur: 18,
    font: `bold ${team2Size}px Sans`,
  });

  drawGlowText(ctx, parsed.dateLine || "", width / 2 - 90, 610, {
    fillStyle: "#d9c7ff",
    shadowColor: "#a76cff",
    shadowBlur: 14,
    font: "bold 42px Sans",
  });

  drawGlowText(ctx, parsed.timeLine || "", width / 2 + 220, 610, {
    fillStyle: "#39ff14",
    shadowColor: "#39ff14",
    shadowBlur: 18,
    font: "bold 48px Sans",
  });

  const startY = 760;
  const rowHeight = 130;
  const rowGap = 26;
  const rowX = 70;
  const rowWidth = width - 140;

  maps.forEach((item, index) => {
    const y = startY + index * (rowHeight + rowGap);
    const colors = sideColors(item.side);

    ctx.save();
    roundedRect(ctx, rowX, y, rowWidth, rowHeight, 24);
    ctx.fillStyle = colors.row;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.border;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "#d8c7ff";
    ctx.font = "bold 34px Sans";
    ctx.fillText((item.mode || "").toUpperCase(), rowX + 28, y + 78);
    ctx.restore();

    const mapText = (item.map || "").toUpperCase();
    const mapSize = fitText(ctx, mapText, 430, 42, 26);

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${mapSize}px Sans`;
    ctx.fillText(mapText, width / 2, y + 78);
    ctx.restore();

    const sideText = (item.side || "").toUpperCase();
    ctx.font = "bold 28px Sans";
    const sideWidth = Math.max(110, Math.min(180, ctx.measureText(sideText).width + 42));

    ctx.save();
    roundedRect(ctx, rowX + rowWidth - sideWidth - 24, y + 32, sideWidth, 52, 22);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.tag;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = colors.tag;
    ctx.font = "bold 28px Sans";
    ctx.fillText(sideText, rowX + rowWidth - sideWidth / 2 - 24, y + 68);
    ctx.restore();
  });

  drawGlowText(ctx, "EVG · EVERGREEN GAMING", width / 2, 1790, {
    fillStyle: "#8d74c9",
    shadowColor: "#8d74c9",
    shadowBlur: 10,
    font: "bold 28px Sans",
  });

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderMatchImage,
};
