const fs = require("fs");
const path = require("path");

const { db } = require("./attendance/db");

const LEGACY_CONFIG_PATH = path.join(__dirname, "config.json");

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

  attendanceChannel: "",
  attendanceReminderChannel: "",
  attendanceReminderUserId: "",
  attendanceRoleIds: [],
  attendanceWebBaseUrl: "",

  currentSchedule: null,
  publicationState: {},
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

let initialized = false;

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function normalizeConfigValue(key, value) {
  switch (key) {
    case "targetChannel1":
    case "targetChannel2":
    case "pngChannel":
    case "scheduleAnnouncementChannel":
    case "requiredRoleId":
    case "optionalRoleId":
    case "attendanceChannel":
    case "attendanceReminderChannel":
    case "attendanceReminderUserId":
    case "attendanceWebBaseUrl":
      return typeof value === "string" ? value : "";

    case "scheduleChannels":
    case "attendanceRoleIds":
      return Array.isArray(value) ? value.filter(Boolean).map(String) : [];

    case "currentSchedule":
      return value ?? null;

    case "publicationState":
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};

    default:
      return value;
  }
}

function normalizeConfig(input) {
  const normalized = cloneDefaultConfig();

  for (const key of CONFIG_KEYS) {
    normalized[key] = normalizeConfigValue(key, input?.[key]);
  }

  return normalized;
}

function serializeValue(value) {
  return JSON.stringify(value);
}

function deserializeValue(key, rawValue) {
  try {
    return normalizeConfigValue(key, JSON.parse(rawValue));
  } catch (error) {
    console.error(`❌ Errore parsing configurazione per la chiave ${key}:`, error);
    return cloneDefaultConfig()[key];
  }
}

function createConfigTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function readLegacyConfig() {
  if (!fs.existsSync(LEGACY_CONFIG_PATH)) {
    return cloneDefaultConfig();
  }

  try {
    const raw = fs.readFileSync(LEGACY_CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.error("❌ Errore lettura config.json legacy:", error);
    return cloneDefaultConfig();
  }
}

function writeAllConfig(config) {
  const normalized = normalizeConfig(config);

  const replace = db.prepare(`
    INSERT INTO app_config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const transaction = db.transaction(payload => {
    for (const key of CONFIG_KEYS) {
      replace.run(key, serializeValue(payload[key]));
    }
  });

  transaction(normalized);
  return normalized;
}

function seedMissingKeys() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO app_config (key, value)
    VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const key of CONFIG_KEYS) {
      insert.run(key, serializeValue(DEFAULT_CONFIG[key]));
    }
  });

  transaction();
}

function initializeConfigStore() {
  if (initialized) {
    return;
  }

  createConfigTable();

  const row = db.prepare("SELECT COUNT(*) AS count FROM app_config").get();

  if (!row || row.count === 0) {
    writeAllConfig(readLegacyConfig());
  } else {
    seedMissingKeys();
  }

  initialized = true;
}

function readConfig() {
  initializeConfigStore();

  try {
    const rows = db.prepare("SELECT key, value FROM app_config").all();
    const config = cloneDefaultConfig();

    for (const row of rows) {
      if (CONFIG_KEYS.includes(row.key)) {
        config[row.key] = deserializeValue(row.key, row.value);
      }
    }

    return normalizeConfig(config);
  } catch (error) {
    console.error("❌ Errore lettura configurazione da SQLite:", error);
    return cloneDefaultConfig();
  }
}

function writeConfig(config) {
  initializeConfigStore();
  return writeAllConfig(config);
}

function updateConfig(mutator) {
  const config = readConfig();
  mutator(config);
  return writeConfig(config);
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
    config.scheduleChannels = Array.isArray(channelIds)
      ? channelIds.filter(Boolean).map(String)
      : [];
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
    config.attendanceRoleIds = Array.isArray(roleIds)
      ? roleIds.filter(Boolean).map(String)
      : [];
  });
}

function setAttendanceWebBaseUrl(url) {
  return updateConfig(config => {
    config.attendanceWebBaseUrl = typeof url === "string" ? url : "";
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
