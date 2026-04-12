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
  attendanceChannel: process.env.ATTENDANCE_CHANNEL || "",
  attendanceReminderChannel: process.env.ATTENDANCE_REMINDER_CHANNEL || "",
  attendanceReminderUserId: process.env.ATTENDANCE_REMINDER_USER_ID || "",
  attendanceRoleIds: process.env.ATTENDANCE_ROLE_IDS
    ? process.env.ATTENDANCE_ROLE_IDS.split(",").map(id => id.trim()).filter(Boolean)
    : [],
  attendanceWebBaseUrl: process.env.ATTENDANCE_WEB_BASE_URL || "http://localhost:3000",
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
      attendanceChannel: parsed.attendanceChannel || "",
      attendanceReminderChannel: parsed.attendanceReminderChannel || "",
      attendanceReminderUserId: parsed.attendanceReminderUserId || "",
      attendanceRoleIds: Array.isArray(parsed.attendanceRoleIds)
        ? parsed.attendanceRoleIds
        : [],
      attendanceWebBaseUrl:
        parsed.attendanceWebBaseUrl ||
        process.env.ATTENDANCE_WEB_BASE_URL ||
        "http://localhost:3000",
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

function updateConfig(mutator) {
  const config = readConfig();
  mutator(config);
  writeConfig(config);
  return config;
}

function setTargetChannel1(channelId) {
  return updateConfig(config => {
    config.targetChannel1 = channelId;
  });
}

function setTargetChannel2(channelId) {
  return updateConfig(config => {
    config.targetChannel2 = channelId;
  });
}

function setPngChannel(channelId) {
  return updateConfig(config => {
    config.pngChannel = channelId;
  });
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
  return updateConfig(config => {
    config.publicationState = config.publicationState || {};
    config.publicationState[channelId] = {
      lastWeekKey: state?.lastWeekKey || "",
      lastMonthKey: state?.lastMonthKey || "",
    };
  });
}

function setScheduleChannels(channelIds) {
  return updateConfig(config => {
    config.scheduleChannels = channelIds;
  });
}

function setScheduleAnnouncementChannel(channelId) {
  return updateConfig(config => {
    config.scheduleAnnouncementChannel = channelId;
  });
}

function setRequiredRoleId(roleId) {
  return updateConfig(config => {
    config.requiredRoleId = roleId;
  });
}

function setOptionalRoleId(roleId) {
  return updateConfig(config => {
    config.optionalRoleId = roleId;
  });
}

function setAttendanceChannel(channelId) {
  return updateConfig(config => {
    config.attendanceChannel = channelId;
  });
}

function setAttendanceReminderChannel(channelId) {
  return updateConfig(config => {
    config.attendanceReminderChannel = channelId;
  });
}

function setAttendanceReminderUserId(userId) {
  return updateConfig(config => {
    config.attendanceReminderUserId = userId;
  });
}

function setAttendanceRoleIds(roleIds) {
  return updateConfig(config => {
    config.attendanceRoleIds = roleIds;
  });
}

function setAttendanceWebBaseUrl(url) {
  return updateConfig(config => {
    config.attendanceWebBaseUrl = url;
  });
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
  setAttendanceChannel,
  setAttendanceReminderChannel,
  setAttendanceReminderUserId,
  setAttendanceRoleIds,
  setAttendanceWebBaseUrl,
};
