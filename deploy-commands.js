const { deployCommands } = require("./discord/deployCommands");

deployCommands()
  .then(result => {
    console.log(`✅ Comandi registrati correttamente (${result.count})`);
  })
  .catch(error => {
    console.error("❌ Errore registrazione comandi:", error);
    process.exit(1);
  });
