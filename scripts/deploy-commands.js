require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { COMMAND_DEFINITIONS } = require('../src/bot/commands');
const { getRequiredEnv } = require('../src/config');

async function deployCommands() {
  const token = getRequiredEnv('TOKEN');
  const clientId = getRequiredEnv('CLIENT_ID');
  const guildId = getRequiredEnv('GUILD_ID');

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: COMMAND_DEFINITIONS,
  });

  console.log('✅ Comandi registrati correttamente');
}

deployCommands().catch(error => {
  console.error('❌ Errore registrazione comandi:', error);
  process.exitCode = 1;
});
