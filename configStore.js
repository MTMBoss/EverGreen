const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");

const DEFAULT_CONFIG = {
  targetChannel1: process.env.TARGET_CHANNEL_1 || "",
  targetChannel2: process.env.TARGET_CHANNEL_2 || "",
  pngChannel: process.env.PNG_CHANNEL || "",
  scheduleChannels: process.env.SCHEDULE_CHANNELS
    ? process.env.SCHEDULE_CHANNELS.split(",").map(id => id.trim()).filter(Boolean)
    : [],
  scheduleAnnouncementChannel: process.env.SCHEDULE_ANNOUNCE_CHANNEL || "",
  requiredRoleId: process.env.REQUIRED_ROLE_ID || "",
  optionalRoleId: process.env.OPTIONAL_ROLE_ID || "",
  currentSchedule: null,
  publicationState: {},
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
      pngChannel: parsed.pngChannel || "",
      scheduleChannels: Array.isArray(parsed.scheduleChannels)
        ? parsed.scheduleChannels
        : [],
      scheduleAnnouncementChannel: parsed.scheduleAnnouncementChannel || "",
      requiredRoleId: parsed.requiredRoleId || "",
      optionalRoleId: parsed.optionalRoleId || "",
      currentSchedule: parsed.currentSchedule || null,
      publicationState:
        parsed.publicationState && typeof parsed.publicationState === "object"
          ? parsed.publicationState
          : {},
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

function setPngChannel(channelId) {
  const config = readConfig();
  config.pngChannel = channelId;
  writeConfig(config);
  return config;
}

function getChannelPublicationState(channelId) {
  const config = readConfig();
  const state = config.publicationState?.[channelId];

  return {
    lastWeekKey: state?.lastWeekKey || "",
    lastMonthKey: state?.lastMonthKey || "",
  };
}

function setChannelPublicationState(channelId, state) {
  const config = readConfig();
  config.publicationState = config.publicationState || {};
  config.publicationState[channelId] = {
    lastWeekKey: state?.lastWeekKey || "",
    lastMonthKey: state?.lastMonthKey || "",
  };
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
  setPngChannel,
  getChannelPublicationState,
  setChannelPublicationState,
  setScheduleChannels,
  setScheduleAnnouncementChannel,
  setRequiredRoleId,
  setOptionalRoleId,
};
