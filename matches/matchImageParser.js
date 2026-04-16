/**
 * STUB ONESTO:
 * qui andrà il parser OCR/vision degli screenshot CODM.
 * Per ora:
 * - salva gli allegati
 * - non inventa dati
 * - marca il match come needs_review = true
 */

async function extractMatchDataFromImages(_attachments) {
    return {
        maps: [],
        players: [],
        needsReview: true,
        extractionSummary:
            "Parser immagini non ancora implementato: allegati salvati e match marcato per review manuale.",
    };
}

module.exports = {
    extractMatchDataFromImages,
};
