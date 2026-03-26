require('dotenv').config();

const { createBotClient } = require('./bot/client');
const { getRequiredEnv } = require('./config');

async function bootstrap() {
  const token = getRequiredEnv('TOKEN');
  const client = createBotClient();
  await client.login(token);
}

bootstrap().catch(error => {
  console.error('❌ Avvio bot fallito:', error);
  process.exitCode = 1;
});
