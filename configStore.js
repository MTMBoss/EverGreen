const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");

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

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
}

function readConfig() {
  ensureConfigFile();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      targetChannel1: parsed.targetChannel1 || "",
      targetChannel2: parsed.targetChannel2 || "",
      scheduleChannels: Array.isArray(parsed.scheduleChannels)
        ? parsed.scheduleChannels
        : [],
      scheduleAnnouncementChannel: parsed.scheduleAnnouncementChannel || "",
      requiredRoleId: parsed.requiredRoleId || "",
      optionalRoleId: parsed.optionalRoleId || "",
      currentSchedule: parsed.currentSchedule || null,
    };
  } catch (error) {
    console.error("❌ Errore lettura config.json:", error);
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function setTargetChannel1(channelId) {
  const config = readConfig();
  config.targetChannel1 = channelId;
  writeConfig(config);
  return config;
}

function setTargetChannel2(channelId) {
  const config = readConfig();
  config.targetChannel2 = channelId;
  writeConfig(config);
  return config;
}

function setScheduleChannels(channelIds) {
  const config = readConfig();
  config.scheduleChannels = channelIds;
  writeConfig(config);
  return config;
}

function setScheduleAnnouncementChannel(channelId) {
  const config = readConfig();
  config.scheduleAnnouncementChannel = channelId;
  writeConfig(config);
  return config;
}

function setRequiredRoleId(roleId) {
  const config = readConfig();
  config.requiredRoleId = roleId;
  writeConfig(config);
  return config;
}

function setOptionalRoleId(roleId) {
  const config = readConfig();
  config.optionalRoleId = roleId;
  writeConfig(config);
  return config;
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
};