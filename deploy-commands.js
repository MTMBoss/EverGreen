require("dotenv").config();
const { REST, Routes, ApplicationCommandType } = require("discord.js");

const commands = [
  {
    name: "Pubblica Match",
    type: ApplicationCommandType.Message,
  },
  {
    name: "Prepara Parte 2",
    type: ApplicationCommandType.Message,
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Comandi registrati correttamente");
  } catch (error) {
    console.error("❌ Errore registrazione comando:", error);
  }
})();