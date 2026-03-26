const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const APP_CONFIG = {
  separatorPath:
    process.env.SEPARATOR_PATH || path.join(ROOT_DIR, 'assets', 'separator.png'),
  configPath: process.env.CONFIG_PATH || path.join(ROOT_DIR, 'data', 'config.json'),
  timezone: process.env.SCHEDULE_TIMEZONE || 'Europe/Rome',
  scheduleCreateCron: process.env.SCHEDULE_CREATE_CRON || '30 8 * * 5',
  scheduleReactionCleanupCron:
    process.env.SCHEDULE_REACTIONS_CLEANUP_CRON || '0 15 * * *',
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variabile ambiente obbligatoria mancante: ${name}. Configurala nel file .env locale.`);
  }
  return value;
}

module.exports = {
  APP_CONFIG,
  getRequiredEnv,
};
