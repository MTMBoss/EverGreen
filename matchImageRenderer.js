const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const BACKGROUND_PATH =
  process.env.MATCH_BG_PATH || path.join(__dirname, "assets", "match-bg.png");

const LOGO_PATH =
  process.env.MATCH_LOGO_PATH || path.join(__dirname, "assets", "logo.png");

const BASE_WIDTH = 1080;
const BASE_HEIGHT = 1920;
const SCALE = 2;

function s(value) {
  return Math.round(value * SCALE);
}

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
    size -= s(1);
  }

  return minSize;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    font = `bold ${s(40)}px Sans`,
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
      rowFill: "#520008",
      rowStroke: "#98303c",
      badgeStroke: "#f06270",
      badgeText: "#f06270",
    };
  }

  return {
    rowFill: "#0a1f57",
    rowStroke: "#315ec4",
    badgeStroke: "#5487f7",
    badgeText: "#5487f7",
  };
}

async function drawBackground(ctx, width, height) {
  if (fs.existsSync(BACKGROUND_PATH)) {
    const bg = await loadImage(BACKGROUND_PATH);
    ctx.drawImage(bg, 0, 0, width, height);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#180028");
  gradient.addColorStop(0.45, "#2b0047");
  gradient.addColorStop(1, "#0d0016");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function findVisibleBounds(image) {
  const tempCanvas = createCanvas(image.width, image.height);
  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.drawImage(image, 0, 0, image.width, image.height);

  const imageData = tempCtx.getImageData(0, 0, image.width, image.height);
  const { data, width, height } = imageData;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      const isVisible = a > 10 && (r > 18 || g > 18 || b > 18);

      if (!isVisible) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX === -1 || maxY === -1) {
    return {
      sx: 0,
      sy: 0,
      sw: image.width,
      sh: image.height,
    };
  }

  const padding = 6;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  return {
    sx: minX,
    sy: minY,
    sw: maxX - minX + 1,
    sh: maxY - minY + 1,
  };
}

async function drawLogo(ctx, width) {
  if (!fs.existsSync(LOGO_PATH)) return;

  const logo = await loadImage(LOGO_PATH);
  const bounds = findVisibleBounds(logo);

  if ("imageSmoothingEnabled" in ctx) {
    ctx.imageSmoothingEnabled = true;
  }
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  const targetHeight = s(180);
  const ratio = targetHeight / bounds.sh;

  const logoWidth = Math.round(bounds.sw * ratio);
  const logoHeight = Math.round(bounds.sh * ratio);

  const x = width / 2 - logoWidth / 2;
  const y = s(26);

  ctx.save();
  ctx.shadowColor = "#8b3dff";
  ctx.shadowBlur = s(6);
  ctx.drawImage(
    logo,
    bounds.sx,
    bounds.sy,
    bounds.sw,
    bounds.sh,
    x,
    y,
    logoWidth,
    logoHeight
  );
  ctx.restore();
}

function drawDateTimeGroup(ctx, width, dateText, timeText) {
  const dateFont = `bold ${s(32)}px Sans`;
  const timeFont = `bold ${s(39)}px Sans`;
  const separatorText = "·";
  const separatorGap = s(12);
  const afterSeparatorGap = s(18);
  const y = s(590);

  ctx.save();
  ctx.font = dateFont;
  const dateWidth = ctx.measureText(dateText).width;

  ctx.font = `bold ${s(14)}px Sans`;
  const separatorWidth = ctx.measureText(separatorText).width;

  ctx.font = timeFont;
  const timeWidth = ctx.measureText(timeText).width;
  ctx.restore();

  const totalWidth =
    dateWidth + separatorGap + separatorWidth + afterSeparatorGap + timeWidth;

  const startX = width / 2 - totalWidth / 2;

  drawText(ctx, dateText, startX, y, {
    font: dateFont,
    fillStyle: "#c6b2df",
    textAlign: "left",
    shadowColor: "#6f42aa",
    shadowBlur: s(0.8),
  });

  const separatorX = startX + dateWidth + separatorGap;
  drawText(ctx, separatorText, separatorX, y - s(1), {
    font: `bold ${s(14)}px Sans`,
    fillStyle: "#8365b1",
    textAlign: "left",
  });

  const timeX =
    startX + dateWidth + separatorGap + separatorWidth + afterSeparatorGap;
  drawText(ctx, timeText, timeX, y, {
    font: timeFont,
    fillStyle: "#30ef10",
    textAlign: "left",
    shadowColor: "#2fff00",
    shadowBlur: s(1.8),
  });
}

function getRowsLayout(count) {
  if (count <= 3) {
    return {
      rowHeight: s(122),
      rowGap: s(18),
      startY: s(720),
      modeFont: s(31),
      mapFontStart: s(40),
      mapFontMin: s(26),
      badgeFont: s(22),
      badgeHeight: s(42),
      badgePadding: s(26),
    };
  }

  if (count === 4) {
    return {
      rowHeight: s(112),
      rowGap: s(16),
      startY: s(710),
      modeFont: s(29),
      mapFontStart: s(38),
      mapFontMin: s(24),
      badgeFont: s(21),
      badgeHeight: s(40),
      badgePadding: s(24),
    };
  }

  if (count === 5) {
    return {
      rowHeight: s(102),
      rowGap: s(14),
      startY: s(700),
      modeFont: s(27),
      mapFontStart: s(36),
      mapFontMin: s(22),
      badgeFont: s(20),
      badgeHeight: s(38),
      badgePadding: s(22),
    };
  }

  return {
    rowHeight: s(94),
    rowGap: s(12),
    startY: s(692),
    modeFont: s(25),
    mapFontStart: s(34),
    mapFontMin: s(20),
    badgeFont: s(19),
    badgeHeight: s(36),
    badgePadding: s(20),
  };
}

async function renderMatchImage(parsed) {
  const width = s(BASE_WIDTH);
  const height = s(BASE_HEIGHT);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx, width, height);

  ctx.fillStyle = "rgba(10, 0, 20, 0.20)";
  ctx.fillRect(0, 0, width, height);

  const { team1, team2 } = splitTitle(parsed.title);
  const maps = parsed.mapLines.map(parseMapLine);

  await drawLogo(ctx, width);

  const team1Text = team1.toUpperCase();
  const team2Text = team2.toUpperCase();

  const team1Size = fitText(ctx, team1Text, s(760), s(92), s(58));
  const team2Size = fitText(ctx, team2Text, s(520), s(84), s(52));

  drawText(ctx, team1Text, width / 2, s(286), {
    font: `bold ${team1Size}px Sans`,
    fillStyle: "#a45aed",
    shadowColor: "#6f30c8",
    shadowBlur: s(3.2),
    strokeStyle: "#6b2fc0",
    lineWidth: s(0.6),
  });

  drawText(ctx, "VS", width / 2, s(382), {
    font: `bold ${s(56)}px Sans`,
    fillStyle: "#31ef12",
    shadowColor: "#2fff00",
    shadowBlur: s(1.8),
  });

  drawText(ctx, team2Text, width / 2, s(494), {
    font: `bold ${team2Size}px Sans`,
    fillStyle: "#d3d3d3",
    shadowColor: "#efefef",
    shadowBlur: s(0.8),
    strokeStyle: "#727272",
    lineWidth: s(0.6),
  });

  drawDateTimeGroup(ctx, width, parsed.dateLine || "", parsed.timeLine || "");

  ctx.save();
  ctx.strokeStyle = "rgba(145, 82, 220, 0.35)";
  ctx.lineWidth = s(1);
  ctx.beginPath();
  ctx.moveTo(0, s(684));
  ctx.lineTo(width, s(684));
  ctx.stroke();
  ctx.restore();

  const layout = getRowsLayout(maps.length);

  const rowX = s(40);
  const rowWidth = s(1000);
  const rowRadius = s(14);

  maps.forEach((item, index) => {
    const y = layout.startY + index * (layout.rowHeight + layout.rowGap);
    const style = sideStyle(item.side);
    const centerY = y + layout.rowHeight / 2;

    ctx.save();
    roundedRect(ctx, rowX, y, rowWidth, layout.rowHeight, rowRadius);
    ctx.fillStyle = style.rowFill;
    ctx.fill();
    ctx.lineWidth = s(1.4);
    ctx.strokeStyle = style.rowStroke;
    ctx.stroke();
    ctx.restore();

    drawText(ctx, (item.mode || "").toUpperCase(), rowX + s(30), centerY, {
      font: `bold ${layout.modeFont}px Sans`,
      fillStyle: "#d8c2ea",
      textAlign: "left",
      textBaseline: "middle",
    });

    const mapText = (item.map || "").toUpperCase();
    const mapSize = fitText(
      ctx,
      mapText,
      s(420),
      layout.mapFontStart,
      layout.mapFontMin
    );

    drawText(ctx, mapText, width / 2, centerY, {
      font: `bold ${mapSize}px Sans`,
      fillStyle: "#f1f1f1",
      textBaseline: "middle",
    });

    const badgeText = (item.side || "").toUpperCase();
    ctx.font = `bold ${layout.badgeFont}px Sans`;
    const badgeWidth = Math.max(
      s(104),
      Math.min(s(145), ctx.measureText(badgeText).width + layout.badgePadding)
    );
    const badgeHeight = layout.badgeHeight;
    const badgeX = rowX + rowWidth - badgeWidth - s(20);
    const badgeY = y + (layout.rowHeight - badgeHeight) / 2;

    ctx.save();
    roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, s(18));
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fill();
    ctx.lineWidth = s(1.8);
    ctx.strokeStyle = style.badgeStroke;
    ctx.stroke();
    ctx.restore();

    drawText(
      ctx,
      badgeText,
      badgeX + badgeWidth / 2,
      badgeY + badgeHeight / 2,
      {
        font: `bold ${layout.badgeFont}px Sans`,
        fillStyle: style.badgeText,
        textBaseline: "middle",
      }
    );
  });

  drawText(ctx, "EVG · EVERGREEN GAMING", width / 2, s(1812), {
    font: `bold ${s(24)}px Sans`,
    fillStyle: "#78659f",
    shadowColor: "#78659f",
    shadowBlur: s(0.6),
  });

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderMatchImage,
};