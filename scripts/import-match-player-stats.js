require("dotenv").config();

const path = require("path");

const {
  DEFAULT_PLAYER_STATS_EXPORT_PATH,
  importPlayerStatsFromExportFile,
} = require("../matches/playerStatsImport");

const INPUT_PATH = process.argv[2] || DEFAULT_PLAYER_STATS_EXPORT_PATH;
const slugArg = process.argv.find(arg => arg.startsWith("--slug="));
const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
const includeEmptyArg = process.argv.includes("--include-empty");

const targetSlug = slugArg ? String(slugArg.split("=")[1] || "").trim() : "";
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0)) : 0;

async function main() {
  const result = await importPlayerStatsFromExportFile({
    inputPath: path.resolve(INPUT_PATH),
    slug: targetSlug,
    limit,
    includeEmpty: includeEmptyArg,
  });

  console.log(
    `ℹ️ Import player stats completato. Aggiornati: ${result.updated}. Saltati: ${result.skipped}.`
  );
}

main().catch(error => {
  console.error("❌ Errore import match player stats:", error);
  process.exit(1);
});
