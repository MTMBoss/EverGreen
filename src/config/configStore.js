const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.cwd(), "config.json");

const DEFAULT_CONFIG = {
  targetChannel1: process.env.TARGET_CHANNEL_1 || "",
  targetChannel2: process.env.TARGET_CHANNEL_2 || "",
  scheduleChannels: process.env.SCHEDULE_CHANNELS
    ? process.env.SCHEDULE_CHANNELS.split(",").map(id => id.trim()).filter(Boolean)
    : [],
  scheduleAnnouncementChannel: process.env.SCHEDULE_ANNOUNCE_CHANNEL || "",
  requiredRoleId: process.env.REQUIRED_ROLE_ID || "",
  optionalRoleId: process.env.OPTIONAL_ROLE_ID || "",
  currentSchedule: null,
};

function normalizeConfig(raw = {}) {
  return {
    targetChannel1: raw.targetChannel1 || DEFAULT_CONFIG.targetChannel1,
    targetChannel2: raw.targetChannel2 || DEFAULT_CONFIG.targetChannel2,
    scheduleChannels: Array.isArray(raw.scheduleChannels)
      ? raw.scheduleChannels.map(id => String(id).trim()).filter(Boolean)
      : [...DEFAULT_CONFIG.scheduleChannels],
    scheduleAnnouncementChannel:
      raw.scheduleAnnouncementChannel || DEFAULT_CONFIG.scheduleAnnouncementChannel,
    requiredRoleId: raw.requiredRoleId || DEFAULT_CONFIG.requiredRoleId,
    optionalRoleId: raw.optionalRoleId || DEFAULT_CONFIG.optionalRoleId,
    currentSchedule: raw.currentSchedule || null,
  };
}

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
}

function readConfig() {
  ensureConfigFile();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.error("❌ Errore lettura config.json:", error);
    return normalizeConfig();
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalizeConfig(config), null, 2), "utf8");
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
  CONFIG_PATH,
  DEFAULT_CONFIG,
  normalizeConfig,
  readConfig,
  writeConfig,
  setTargetChannel1,
  setTargetChannel2,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
};