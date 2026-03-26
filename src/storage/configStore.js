const fs = require('node:fs');
const path = require('node:path');
const { APP_CONFIG } = require('../config');

const CONFIG_PATH = APP_CONFIG.configPath;

const DEFAULT_CONFIG = {
  targetChannel1: process.env.TARGET_CHANNEL_1 || '',
  targetChannel2: process.env.TARGET_CHANNEL_2 || '',
  scheduleChannels: process.env.SCHEDULE_CHANNELS
    ? process.env.SCHEDULE_CHANNELS.split(',').map(id => id.trim()).filter(Boolean)
    : [],
  scheduleAnnouncementChannel: process.env.SCHEDULE_ANNOUNCE_CHANNEL || '',
  requiredRoleId: process.env.REQUIRED_ROLE_ID || '',
  optionalRoleId: process.env.OPTIONAL_ROLE_ID || '',
  currentSchedule: null,
};

function ensureConfigFile() {
  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

function normalizeConfig(parsed) {
  return {
    targetChannel1: parsed.targetChannel1 || '',
    targetChannel2: parsed.targetChannel2 || '',
    scheduleChannels: Array.isArray(parsed.scheduleChannels) ? parsed.scheduleChannels : [],
    scheduleAnnouncementChannel: parsed.scheduleAnnouncementChannel || '',
    requiredRoleId: parsed.requiredRoleId || '',
    optionalRoleId: parsed.optionalRoleId || '',
    currentSchedule: parsed.currentSchedule || null,
  };
}

function readConfig() {
  ensureConfigFile();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    console.error('❌ Errore lettura config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config) {
  ensureConfigFile();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function updateConfig(mutator) {
  const current = readConfig();
  const next = mutator({ ...current });
  writeConfig(next);
  return next;
}

function setTargetChannel1(channelId) {
  return updateConfig(config => ({ ...config, targetChannel1: channelId }));
}

function setTargetChannel2(channelId) {
  return updateConfig(config => ({ ...config, targetChannel2: channelId }));
}

function setScheduleChannels(channelIds) {
  return updateConfig(config => ({ ...config, scheduleChannels: channelIds }));
}

function setScheduleAnnouncementChannel(channelId) {
  return updateConfig(config => ({ ...config, scheduleAnnouncementChannel: channelId }));
}

function setRequiredRoleId(roleId) {
  return updateConfig(config => ({ ...config, requiredRoleId: roleId }));
}

function setOptionalRoleId(roleId) {
  return updateConfig(config => ({ ...config, optionalRoleId: roleId }));
}

module.exports = {
  readConfig,
  writeConfig,
  setTargetChannel1,
  setTargetChannel2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
  DEFAULT_CONFIG,
};
