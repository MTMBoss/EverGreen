const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");

const WIDTH = 1700;
const HEIGHT = 1180;

const LOGO_PATH = path.join(__dirname, "..", "web", "public", "evergreen-logo.png");

function roundRect(ctx, x, y, width, height, radius) {
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

function drawRoundedBox(ctx, x, y, width, height, radius, fillStyle, strokeStyle = null, lineWidth = 1) {
    ctx.save();
    roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
    }
    ctx.restore();
}

function fitText(ctx, text, maxWidth) {
    let output = String(text || "");
    if (!maxWidth) return output;

    while (output.length > 0 && ctx.measureText(output).width > maxWidth) {
        output = output.slice(0, -1);
    }

    if (output !== text && output.length > 3) {
        output = `${output.slice(0, -3)}...`;
    }

    return output;
}

function drawText(ctx, text, x, y, options = {}) {
    const {
        font = "28px Sans",
        color = "#ffffff",
        align = "left",
        baseline = "alphabetic",
        maxWidth,
    } = options;

    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    const output = maxWidth ? fitText(ctx, text, maxWidth) : String(text || "");
    ctx.fillText(output, x, y);

    ctx.restore();
}

function getRankColor(index) {
    if (index === 0) return { bar: "#e0b100", text: "#f7e7a1" };
    if (index === 1) return { bar: "#c7cbd1", text: "#eef1f4" };
    if (index === 2) return { bar: "#a86a2c", text: "#f2d1b0" };
    return { bar: "#6a86d9", text: "#dbe6ff" };
}

function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#0b0d12");
    gradient.addColorStop(0.35, "#121824");
    gradient.addColorStop(0.7, "#0f1622");
    gradient.addColorStop(1, "#0b0f16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 70; i += 1) {
        const x = (i * 197) % WIDTH;
        const y = (i * 149) % HEIGHT;
        ctx.fillStyle = i % 2 === 0 ? "#7fbf7f" : "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#ffffff";
    for (let y = 120; y < HEIGHT; y += 120) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawColumnHeaders(ctx, x, y, width) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawText(ctx, "Player", x + 135, y, {
        font: "bold 24px Sans",
        color: "#7eb8ff",
    });

    drawText(ctx, "Slot coperti", x + width - 540, y, {
        font: "bold 24px Sans",
        color: "#7eb8ff",
        align: "right",
    });

    drawText(ctx, "Giorni", x + width - 360, y, {
        font: "bold 24px Sans",
        color: "#7eb8ff",
        align: "right",
    });

    drawText(ctx, "Full", x + width - 220, y, {
        font: "bold 24px Sans",
        color: "#7eb8ff",
        align: "right",
    });

    drawText(ctx, "Rate", x + width - 70, y, {
        font: "bold 24px Sans",
        color: "#7eb8ff",
        align: "right",
    });
    ctx.restore();
}

function drawSummaryCard(ctx, x, y, width, height, title, value, valueColor = "#f1f3f7") {
    drawRoundedBox(ctx, x, y, width, height, 20, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)", 1);

    drawText(ctx, title, x + 28, y + 42, {
        font: "bold 24px Sans",
        color: "#9eb2ca",
    });

    drawText(ctx, value, x + 28, y + 95, {
        font: "bold 40px Sans",
        color: valueColor,
    });
}

async function renderAttendanceLeaderboardImage(data) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    drawBackground(ctx);

    drawRoundedBox(
        ctx,
        24,
        24,
        WIDTH - 48,
        HEIGHT - 48,
        32,
        "rgba(18, 24, 36, 0.94)",
        "rgba(255,255,255,0.08)",
        2
    );


    let logo = null;
    try {
        logo = await loadImage(LOGO_PATH);
    } catch {
        logo = null;
    }

    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(110, 110, 46, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logo, 64, 64, 92, 92);
        ctx.restore();
    }

    drawText(ctx, "Leaderboard Presenze", 182, 98, {
        font: "bold 70px Sans",
        color: "#f0e4a0",
    });

    drawText(ctx, data.subtitle || "Classifica", 182, 155, {
        font: "bold 44px Sans",
        color: "#67b3ff",
    });

    drawText(ctx, data.periodLabel || "", 182, 205, {
        font: "34px Sans",
        color: "#d4d7de",
    });

    drawRoundedBox(
        ctx,
        66,
        250,
        WIDTH - 132,
        660,
        30,
        "rgba(255,255,255,0.035)",
        "rgba(255,255,255,0.10)",
        2
    );

    const tableLeft = 90;
    const tableWidth = WIDTH - 180;
    const rowHeight = 56;
    const rowBoxHeight = 48;
    const startY = 338;

    drawColumnHeaders(ctx, tableLeft, 312, tableWidth);

    for (let i = 0; i < Math.min(data.rows.length, 10); i += 1) {
        const row = data.rows[i];
        const y = startY + i * rowHeight;
        const colors = getRankColor(i);

        drawRoundedBox(
            ctx,
            tableLeft,
            y,
            tableWidth,
            rowBoxHeight,
            14,
            "rgba(14, 18, 28, 0.92)",
            "rgba(255,255,255,0.06)",
            1
        );

        drawRoundedBox(ctx, tableLeft, y, 12, rowBoxHeight, 10, colors.bar);

        drawText(ctx, `${i + 1}.`, tableLeft + 34, y + 30, {
            font: "bold 26px Sans",
            color: "#ffffff",
        });

        drawText(ctx, row.label, tableLeft + 100, y + 30, {
            font: "bold 28px Sans",
            color: "#f1f3f7",
            maxWidth: 620,
        });

        drawText(ctx, `${row.slotsCovered} slot`, tableLeft + tableWidth - 540, y + 30, {
            font: "bold 26px Sans",
            color: colors.text,
            align: "right",
        });

        drawText(ctx, `${row.daysPresent} gg`, tableLeft + tableWidth - 360, y + 30, {
            font: "26px Sans",
            color: "#d4d7de",
            align: "right",
        });

        drawText(ctx, `${row.fullDays} full`, tableLeft + tableWidth - 220, y + 30, {
            font: "26px Sans",
            color: "#d4d7de",
            align: "right",
        });

        drawText(ctx, `${row.presenceRate}%`, tableLeft + tableWidth - 70, y + 30, {
            font: "bold 28px Sans",
            color: "#b8f2a5",
            align: "right",
        });
    }

    const summaryY = 950;
    const gap = 28;
    const cardWidth = 245;
    const cardHeight = 130;
    const cardX1 = 90;
    const cardX2 = cardX1 + cardWidth + gap;
    const cardX3 = cardX2 + cardWidth + gap;
    const cardX4 = cardX3 + cardWidth + gap;
    const cardX5 = cardX4 + cardWidth + gap;

    drawSummaryCard(
        ctx,
        cardX1,
        summaryY,
        cardWidth,
        cardHeight,
        "Roster attivo",
        String(data.summary.totalMembers || 0),
        "#f1f3f7"
    );

    drawSummaryCard(
        ctx,
        cardX2,
        summaryY,
        cardWidth,
        cardHeight,
        "Media slot coperti",
        String(data.summary.avgSlotsCovered || 0),
        "#d4d7de"
    );

    drawSummaryCard(
        ctx,
        cardX3,
        summaryY,
        cardWidth,
        cardHeight,
        "Top fascia 21-22",
        String(data.summary.slot21Top || 0),
        "#9de26f"
    );

    drawSummaryCard(
        ctx,
        cardX4,
        summaryY,
        cardWidth,
        cardHeight,
        "Top fascia 22-23",
        String(data.summary.slot22Top || 0),
        "#d7dde8"
    );

    drawSummaryCard(
        ctx,
        cardX5,
        summaryY,
        cardWidth,
        cardHeight,
        "Top fascia 23-00",
        String(data.summary.slot23Top || 0),
        "#ff9d6d"
    );

    return canvas.toBuffer("image/png");
}

module.exports = {
    renderAttendanceLeaderboardImage,
};
