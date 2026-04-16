const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function extractMatchDataFromImages(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return {
            maps: [],
            players: [],
            needsReview: true,
            extractionSummary: "Nessuno screenshot trovato nella Parte 2.",
        };
    }

    const worker = await createWorker("eng");
    const maps = [];
    const players = [];
    const debug = [];

    try {
        for (let index = 0; index < attachments.length; index += 1) {
            const attachment = attachments[index];
            const sourceBuffer = await downloadImageBuffer(attachment.url);

            const metadata = await sharp(sourceBuffer).metadata();
            const width = metadata.width || 0;
            const height = metadata.height || 0;

            const scoreZones = buildScoreZones(width, height);

            let bestScore = null;
            let bestScoreWeight = -1;
            let bestSource = "none";

            const fullImageVariants = await buildGlobalVariants(sourceBuffer);

            for (const variant of fullImageVariants) {
                const result = await worker.recognize(variant.buffer);
                const text = normalizeOcrText(result.data?.text || "");
                const confidence = Number(result.data?.confidence || 0);

                const score = extractBestScoreFromText(text);

                debug.push({
                    image: index + 1,
                    kind: "full",
                    variant: variant.name,
                    confidence,
                    textPreview: text.slice(0, 250),
                    score,
                });

                if (score) {
                    const weight = confidence + score.weight + 5;
                    if (weight > bestScoreWeight) {
                        bestScoreWeight = weight;
                        bestScore = score;
                        bestSource = `full:${variant.name}`;
                    }
                }
            }

            for (const zone of scoreZones) {
                const zoneVariants = await buildZoneVariants(sourceBuffer, zone);

                for (const variant of zoneVariants) {
                    const result = await worker.recognize(variant.buffer);
                    const text = normalizeOcrText(result.data?.text || "");
                    const confidence = Number(result.data?.confidence || 0);

                    const score = extractBestScoreFromText(text);

                    debug.push({
                        image: index + 1,
                        kind: "zone",
                        zone: zone.name,
                        variant: variant.name,
                        confidence,
                        textPreview: text.slice(0, 250),
                        score,
                    });

                    if (score) {
                        const weight = confidence + score.weight + 20;
                        if (weight > bestScoreWeight) {
                            bestScoreWeight = weight;
                            bestScore = score;
                            bestSource = `zone:${zone.name}:${variant.name}`;
                        }
                    }
                }
            }

            if (bestScore) {
                maps.push({
                    orderIndex: index + 1,
                    team1Score: bestScore.team1Score,
                    team2Score: bestScore.team2Score,
                    mode: "",
                    map: "",
                    side: "",
                });
            }

            debug.push({
                image: index + 1,
                selectedScoreSource: bestSource,
                selectedScore: bestScore,
                extractedPlayers: 0,
            });
        }
    } finally {
        await worker.terminate();
    }

    return {
        maps: dedupeMapsByOrder(maps),
        players,
        needsReview: true,
        extractionSummary: buildSummary(maps, players, attachments.length),
        debug,
    };
}

async function downloadImageBuffer(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Download screenshot fallito (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

function buildScoreZones(width, height) {
    if (!width || !height) {
        return [];
    }

    return [
        {
            name: "top_center",
            left: Math.floor(width * 0.28),
            top: Math.floor(height * 0.0),
            width: Math.floor(width * 0.44),
            height: Math.floor(height * 0.2),
        },
        {
            name: "top_left",
            left: Math.floor(width * 0.0),
            top: Math.floor(height * 0.0),
            width: Math.floor(width * 0.4),
            height: Math.floor(height * 0.22),
        },
        {
            name: "top_full",
            left: 0,
            top: 0,
            width,
            height: Math.floor(height * 0.24),
        },
    ];
}

async function buildGlobalVariants(buffer) {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 0;

    const resized =
        width > 1600
            ? image.resize({ width: 1600, withoutEnlargement: true })
            : image.clone();

    const grayscale = await resized
        .clone()
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

    const thresholdA = await resized
        .clone()
        .grayscale()
        .normalize()
        .linear(1.18, -10)
        .threshold(185)
        .sharpen()
        .png()
        .toBuffer();

    return [
        { name: "grayscale", buffer: grayscale },
        { name: "thresholdA", buffer: thresholdA },
    ];
}

async function buildZoneVariants(buffer, zone) {
    const cropped = sharp(buffer)
        .rotate()
        .extract({
            left: Math.max(0, zone.left),
            top: Math.max(0, zone.top),
            width: Math.max(1, zone.width),
            height: Math.max(1, zone.height),
        })
        .resize({ width: 1400, withoutEnlargement: false });

    const grayscale = await cropped
        .clone()
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

    const thresholdA = await cropped
        .clone()
        .grayscale()
        .normalize()
        .linear(1.22, -12)
        .threshold(185)
        .sharpen()
        .png()
        .toBuffer();

    return [
        { name: "grayscale", buffer: grayscale },
        { name: "thresholdA", buffer: thresholdA },
    ];
}

function normalizeOcrText(text) {
    return String(text || "")
        .replace(/[|]/g, "1")
        .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0")
        .replace(/[Ss](?=\d)|(?<=\d)[Ss]/g, "5")
        .replace(/[^\S\r\n]+/g, " ")
        .replace(/\r/g, "")
        .trim();
}

function extractBestScoreFromText(text) {
    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const candidates = [];

    for (const line of lines) {
        for (const score of extractScoresFromLine(line)) {
            candidates.push({
                ...score,
                line,
                weight: scoreWeight(score.team1Score, score.team2Score, line),
            });
        }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.weight - a.weight);
    return candidates[0];
}

function extractScoresFromLine(line) {
    const results = [];
    const patterns = [
        /(\d{1,3})\s*[:\-]\s*(\d{1,3})/g,
        /(\d{1,3})\s+(\d{1,3})/g,
    ];

    for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) {
            const left = Number(match[1]);
            const right = Number(match[2]);

            if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
            if (!isPlausibleScore(left, right)) continue;

            results.push({
                team1Score: left,
                team2Score: right,
            });
        }
    }

    return results;
}

function isPlausibleScore(a, b) {
    if (a < 0 || b < 0) return false;
    if (a > 300 || b > 300) return false;

    const hpLike = a <= 250 && b <= 250;
    const sndLike = a <= 13 && b <= 13;
    const ctlLike = a <= 5 && b <= 5;

    return hpLike || sndLike || ctlLike;
}

function scoreWeight(a, b, line) {
    let score = 0;

    if (/[:\-]/.test(line)) score += 22;
    if (a === 250 || b === 250 || (a >= 80 && b >= 80)) score += 20;
    if ((a <= 13 && b <= 13) || (a <= 5 && b <= 5)) score += 12;
    if (line.length <= 24) score += 8;
    if (line.length > 50) score -= 10;

    const digits = (line.match(/\d/g) || []).length;
    if (digits > 8) score -= 12;

    return score;
}

function dedupeMapsByOrder(maps) {
    const out = [];
    const seen = new Set();

    for (const map of maps || []) {
        if (seen.has(map.orderIndex)) continue;
        seen.add(map.orderIndex);
        out.push(map);
    }

    return out;
}

function buildSummary(maps, players, totalImages) {
    return (
        `OCR eseguito su ${totalImages} screenshot. ` +
        `Score mappa riconosciuti: ${maps.length}. ` +
        `Righe player candidate: ${players.length}. ` +
        `Review manuale consigliata.`
    );
}

module.exports = {
    extractMatchDataFromImages,
};
