const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const SCORE_PATTERNS = [
    /(\d{1,3})\s*[:\-]\s*(\d{1,3})/g,
    /(\d{1,3})\s+(\d{1,3})/g,
];

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
    const debug = [];
    const maps = [];
    const players = [];

    try {
        for (let index = 0; index < attachments.length; index += 1) {
            const attachment = attachments[index];
            const imageBuffer = await downloadImageBuffer(attachment.url);

            const variants = await buildImageVariants(imageBuffer);

            let bestText = "";
            let bestScore = null;
            let bestConfidence = -1;

            for (const variant of variants) {
                const ocr = await worker.recognize(variant.buffer);
                const text = normalizeOcrText(ocr.data?.text || "");
                const confidence = Number(ocr.data?.confidence || 0);

                const scoreCandidate = extractBestScoreFromText(text);

                debug.push({
                    image: index + 1,
                    variant: variant.name,
                    confidence,
                    textPreview: text.slice(0, 400),
                    scoreCandidate,
                });

                let scoreWeight = confidence;
                if (scoreCandidate) scoreWeight += 25;

                if (scoreWeight > bestConfidence) {
                    bestConfidence = scoreWeight;
                    bestText = text;
                    bestScore = scoreCandidate;
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
                selectedScore: bestScore,
                selectedTextPreview: bestText.slice(0, 400),
            });
        }
    } finally {
        await worker.terminate();
    }

    const uniqueMaps = dedupeMapsByOrder(maps);

    return {
        maps: uniqueMaps,
        players,
        needsReview: true,
        extractionSummary: buildSummary(uniqueMaps, attachments.length),
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

async function buildImageVariants(buffer) {
    const base = sharp(buffer).rotate();

    const metadata = await base.metadata();
    const width = metadata.width || 0;

    const resized =
        width > 1800
            ? base.resize({ width: 1800, withoutEnlargement: true })
            : base.clone();

    const original = await resized.clone().png().toBuffer();

    const grayscale = await resized
        .clone()
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

    const thresholdLight = await resized
        .clone()
        .grayscale()
        .normalize()
        .linear(1.2, -15)
        .threshold(185)
        .sharpen()
        .png()
        .toBuffer();

    const thresholdStrong = await resized
        .clone()
        .grayscale()
        .normalize()
        .linear(1.35, -25)
        .threshold(200)
        .sharpen()
        .png()
        .toBuffer();

    const inverted = await resized
        .clone()
        .grayscale()
        .normalize()
        .negate()
        .threshold(180)
        .sharpen()
        .png()
        .toBuffer();

    return [
        { name: "original", buffer: original },
        { name: "grayscale", buffer: grayscale },
        { name: "thresholdLight", buffer: thresholdLight },
        { name: "thresholdStrong", buffer: thresholdStrong },
        { name: "inverted", buffer: inverted },
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
        const lineCandidates = extractScoresFromLine(line);
        for (const score of lineCandidates) {
            const weight = scoreWeight(score.team1Score, score.team2Score, line);
            candidates.push({
                ...score,
                line,
                weight,
            });
        }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.weight - a.weight);

    return {
        team1Score: candidates[0].team1Score,
        team2Score: candidates[0].team2Score,
    };
}

function extractScoresFromLine(line) {
    const results = [];

    for (const pattern of SCORE_PATTERNS) {
        const matches = [...line.matchAll(pattern)];
        for (const match of matches) {
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

    // Range tipici CODM
    const hpLike = a <= 250 && b <= 250;
    const sndLike = a <= 13 && b <= 13;
    const ctlLike = a <= 5 && b <= 5;

    return hpLike || sndLike || ctlLike;
}

function scoreWeight(a, b, line) {
    let score = 0;

    // preferisce linee con separatore esplicito
    if (/[:\-]/.test(line)) score += 20;

    // punteggi tipici HP
    if ((a === 250 || b === 250) || (a >= 100 && b >= 100)) score += 18;

    // punteggi tipici S&D / Ctl
    if ((a <= 13 && b <= 13) || (a <= 5 && b <= 5)) score += 12;

    // scarta un po' linee troppo lunghe con rumore OCR
    if (line.length <= 20) score += 8;
    if (line.length > 50) score -= 8;

    // linee con troppe cifre spesso sono scoreboard player, non score mappa
    const digits = (line.match(/\d/g) || []).length;
    if (digits > 8) score -= 12;

    return score;
}

function dedupeMapsByOrder(maps) {
    const out = [];
    const seen = new Set();

    for (const map of maps) {
        if (seen.has(map.orderIndex)) continue;
        seen.add(map.orderIndex);
        out.push(map);
    }

    return out;
}

function buildSummary(maps, totalImages) {
    if (maps.length === 0) {
        return `OCR eseguito su ${totalImages} screenshot, ma nessuno score mappa è stato riconosciuto con sufficiente affidabilità.`;
    }

    return `OCR eseguito su ${totalImages} screenshot. Riconosciuti ${maps.length} score mappa. Review manuale consigliata per player e K/D/A.`;
}

module.exports = {
    extractMatchDataFromImages,
};
