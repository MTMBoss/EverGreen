const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");

const WIDTH = 1100;
const HEIGHT = 1400;

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

    if (maxWidth) {
        let output = String(text || "");
        while (ctx.measureText(output).width > maxWidth && output.length > 0) {
            output = output.slice(0, -1);
        }
        if (output !== text && output.length > 3) {
            output = `${output.slice(0, -3)}...`;
        }
        ctx.fillText(output, x, y);
    } else {
        ctx.fillText(String(text || ""), x, y);
    }

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
    gradient.addColorStop(0.5, "#141922");
    gradient.addColorStop(1, "#0d1016");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 40; i += 1) {
        const x = (i * 137) % WIDTH;
        const y = (i * 211) % HEIGHT;
        ctx.fillStyle = i % 2 === 0 ? "#6fa86f" : "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

async function renderAttendanceLeaderboardImage(data) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    drawBackground(ctx);

    drawRoundedBox(ctx, 40, 40, WIDTH - 80, HEIGHT - 80, 30, "rgba(19, 24, 34, 0.92)", "rgba(255,255,255,0.08)", 2);
    drawRoundedBox(ctx, 50, 50, 14, HEIGHT - 100, 10, "#d9b11f");

    let logo = null;
    try {
        logo = await loadImage(LOGO_PATH);
    } catch {
        logo = null;
    }

    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(120, 120, 45, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logo, 75, 75, 90, 90);
        ctx.restore();
    }

    drawText(ctx, "Leaderboard Presenze", 190, 105, {
        font: "bold 56px Sans",
        color: "#f0e4a0",
    });

    drawText(ctx, data.subtitle || "Classifica", 190, 160, {
        font: "bold 38px Sans",
        color: "#67b3ff",
    });

    drawText(ctx, data.periodLabel || "", 190, 205, {
        font: "30px Sans",
        color: "#d4d7de",
    });

    drawRoundedBox(ctx, 90, 260, WIDTH - 180, 900, 28, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.10)", 2);

    const startY = 310;
    const rowHeight = 72;
    const left = 115;
    const width = WIDTH - 230;

    for (let i = 0; i < Math.min(data.rows.length, 10); i += 1) {
        const row = data.rows[i];
        const y = startY + i * rowHeight;
        const colors = getRankColor(i);

        drawRoundedBox(ctx, left, y, width, 58, 14, "rgba(16, 20, 28, 0.88)", "rgba(255,255,255,0.06)", 1);
        drawRoundedBox(ctx, left, y, 14, 58, 14, colors.bar);

        drawText(ctx, `${i + 1}.`, left + 44, y + 38, {
            font: "bold 28px Sans",
            color: "#ffffff",
        });

        drawText(ctx, row.label, left + 105, y + 38, {
            font: "bold 26px Sans",
            color: "#f1f3f7",
            maxWidth: 360,
        });

        drawText(ctx, `${row.slotsCovered} slot`, left + 560, y + 38, {
            font: "bold 24px Sans",
            color: colors.text,
            align: "right",
        });

        drawText(ctx, `${row.daysPresent} gg`, left + 700, y + 38, {
            font: "24px Sans",
            color: "#d4d7de",
            align: "right",
        });

        drawText(ctx, `${row.fullDays} full`, left + 840, y + 38, {
            font: "24px Sans",
            color: "#d4d7de",
            align: "right",
        });

        drawText(ctx, `${row.presenceRate}%`, left + 955, y + 38, {
            font: "bold 28px Sans",
            color: "#b8f2a5",
            align: "right",
        });
    }

    const summaryY = 1210;

    drawText(ctx, `Roster attivo: ${data.summary.totalMembers}`, 110, summaryY, {
        font: "bold 30px Sans",
        color: "#f1f3f7",
    });

    drawText(ctx, `Media slot coperti: ${data.summary.avgSlotsCovered}`, 110, summaryY + 48, {
        font: "28px Sans",
        color: "#d4d7de",
    });

    drawText(ctx, `Top fascia 21-22: ${data.summary.slot21Top}`, 650, summaryY, {
        font: "bold 30px Sans",
        color: "#9de26f",
    });

    drawText(ctx, `Top fascia 22-23: ${data.summary.slot22Top}`, 650, summaryY + 48, {
        font: "30px Sans",
        color: "#c7ccd6",
    });

    drawText(ctx, `Top fascia 23-00: ${data.summary.slot23Top}`, 650, summaryY + 96, {
        font: "30px Sans",
        color: "#ff9d6d",
    });

    return canvas.toBuffer("image/png");
}

module.exports = {
    renderAttendanceLeaderboardImage,
};
