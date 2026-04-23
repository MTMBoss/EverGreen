const { readConfig } = require("../config/configStore");
const {
  getMatchesNeedingImageReanalysis,
  reanalyzeStoredMatchImages,
} = require("./matchService");

const MATCH_REANALYSIS_TICK_MS = Number(
  process.env.MATCH_REANALYSIS_TICK_MS || 30 * 1000
);
const MATCH_REANALYSIS_IDLE_TICK_MS = Number(
  process.env.MATCH_REANALYSIS_IDLE_TICK_MS || 10 * 60 * 1000
);
const MATCH_REANALYSIS_PER_TICK = Number(
  process.env.MATCH_REANALYSIS_PER_TICK || 1
);

let reanalysisTimer = null;
let reanalysisRunning = false;

function startMatchImageReanalysisWorker() {
  if (reanalysisTimer) return;
  scheduleNextReanalysisTick(20 * 1000);
}

function scheduleNextReanalysisTick(delayMs = MATCH_REANALYSIS_TICK_MS) {
  if (reanalysisTimer) {
    clearTimeout(reanalysisTimer);
  }

  reanalysisTimer = setTimeout(async () => {
    reanalysisTimer = null;
    await runMatchImageReanalysisTick();
  }, delayMs);

  reanalysisTimer.unref?.();
}

async function runMatchImageReanalysisTick() {
  if (reanalysisRunning) {
    scheduleNextReanalysisTick(MATCH_REANALYSIS_TICK_MS);
    return;
  }

  reanalysisRunning = true;

  try {
    const config = readConfig();
    if (!config.matchImportState?.completed) {
      console.log("ℹ️ Rianalisi match in attesa: import storico ancora in corso");
      scheduleNextReanalysisTick(MATCH_REANALYSIS_TICK_MS);
      return;
    }

    const candidates = await getMatchesNeedingImageReanalysis(
      MATCH_REANALYSIS_PER_TICK
    );

    if (!candidates.length) {
      scheduleNextReanalysisTick(MATCH_REANALYSIS_IDLE_TICK_MS);
      return;
    }

    for (const candidate of candidates) {
      try {
        const result = await reanalyzeStoredMatchImages(candidate.id);
        console.log("✅ Rianalisi match completata:", {
          slug: result.slug,
          extractedMaps: result.extractedMaps,
          extractedPlayers: result.extractedPlayers,
          skipped: result.skipped,
          reason: result.reason || "",
        });
      } catch (error) {
        console.error(
          `❌ Errore rianalisi match ${candidate.slug}:`,
          error.message || error
        );
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally {
    reanalysisRunning = false;
    scheduleNextReanalysisTick(MATCH_REANALYSIS_TICK_MS);
  }
}

module.exports = {
  startMatchImageReanalysisWorker,
};
