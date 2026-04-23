const fs = require("fs");
const path = require("path");

const { pool, ensureDbReady } = require("../attendance/db");

const LEGACY_CONFIG_PATH = path.join(__dirname, "..", "config.json");
const MATCH_IMPORT_STATE_VERSION = 4;

const DEFAULT_CONFIG = {
  attendanceLeaderboardChannel: process.env.ATTENDANCE_LEADERBOARD_CHANNEL || "",
  attendanceLeaderboardMessageId: "",
  attendanceLeaderboardDefaultType: process.env.ATTENDANCE_LEADERBOARD_DEFAULT_TYPE || "settimana",
  targetChannel1: process.env.TARGET_CHANNEL_1 || "",
  targetChannel2: process.env.TARGET_CHANNEL_2 || "",
  pngChannel: process.env.PNG_CHANNEL || "",
  sourceChannelPart1: process.env.SOURCE_CHANNEL_PART_1 || "",
  sourceChannelPart2: process.env.SOURCE_CHANNEL_PART_2 || "",
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
  attendanceWebBaseUrl: process.env.ATTENDANCE_WEB_BASE_URL || "",
  commandDeploymentHash: "",
  matchImportState: {
    version: MATCH_IMPORT_STATE_VERSION,
    sourceChannelPart1: "",
    sourceChannelPart2: "",
    part1Before: "",
    part2Before: "",
    completed: false,
  },

  currentSchedule: null,
  publicationState: {},
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

let initialized = false;
let initPromise = null;
let currentConfig = cloneConfig(DEFAULT_CONFIG);

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeConfigValue(key, value) {
  switch (key) {
    case "attendanceLeaderboardChannel":
    case "attendanceLeaderboardMessageId":
    case "attendanceLeaderboardDefaultType":
    case "targetChannel1":
    case "targetChannel2":
    case "pngChannel":
    case "sourceChannelPart1":
    case "sourceChannelPart2":
    case "scheduleAnnouncementChannel":
    case "requiredRoleId":
    case "optionalRoleId":
    case "attendanceChannel":
    case "attendanceReminderChannel":
    case "attendanceReminderUserId":
    case "attendanceWebBaseUrl":
    case "commandDeploymentHash":
      return typeof value === "string" ? value : "";

    case "matchImportState":
      return value && typeof value === "object" && !Array.isArray(value)
        ? {
            version:
              Number(value.version || 0) > 0
                ? Number(value.version)
                : MATCH_IMPORT_STATE_VERSION,
            sourceChannelPart1: String(value.sourceChannelPart1 || ""),
            sourceChannelPart2: String(value.sourceChannelPart2 || ""),
            part1Before: String(value.part1Before || ""),
            part2Before: String(value.part2Before || ""),
            completed: Boolean(value.completed),
          }
        : cloneConfig(DEFAULT_CONFIG).matchImportState;

    case "scheduleChannels":
    case "attendanceRoleIds":
      return Array.isArray(value)
        ? value.filter(Boolean).map(item => String(item))
        : [];

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
  const normalized = cloneConfig(DEFAULT_CONFIG);

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
    return cloneConfig(DEFAULT_CONFIG)[key];
  }
}

async function createConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function readLegacyConfigSync() {
  if (!fs.existsSync(LEGACY_CONFIG_PATH)) {
    return cloneConfig(DEFAULT_CONFIG);
  }

  try {
    const raw = fs.readFileSync(LEGACY_CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.error("❌ Errore lettura config.json legacy:", error);
    return cloneConfig(DEFAULT_CONFIG);
  }
}

async function persistAllConfig(config) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const key of CONFIG_KEYS) {
      await client.query(
        `
        INSERT INTO app_config (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `,
        [key, serializeValue(config[key])]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeConfigStore() {
  if (initialized) {
    return cloneConfig(currentConfig);
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await ensureDbReady();
    await createConfigTable();

    const result = await pool.query(`SELECT key, value FROM app_config`);

    if (!result.rows.length) {
      currentConfig = normalizeConfig(readLegacyConfigSync());
      await persistAllConfig(currentConfig);
    } else {
      const loaded = cloneConfig(DEFAULT_CONFIG);

      for (const row of result.rows) {
        if (CONFIG_KEYS.includes(row.key)) {
          loaded[row.key] = deserializeValue(row.key, row.value);
        }
      }

      currentConfig = normalizeConfig(loaded);
      await persistAllConfig(currentConfig);
    }

    initialized = true;
    return cloneConfig(currentConfig);
  })().catch(error => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

function readConfig() {
  return cloneConfig(currentConfig);
}

function writeConfig(config) {
  currentConfig = normalizeConfig(config);

  persistAllConfig(currentConfig).catch(error => {
    console.error("❌ Errore salvataggio configurazione su Neon:", error);
  });

  return cloneConfig(currentConfig);
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

function setSourceChannelPart1(channelId) {
  return updateConfig(config => {
    config.sourceChannelPart1 = channelId;
  });
}

function setSourceChannelPart2(channelId) {
  return updateConfig(config => {
    config.sourceChannelPart2 = channelId;
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

function setCommandDeploymentHash(hash) {
  return updateConfig(config => {
    config.commandDeploymentHash = typeof hash === "string" ? hash : "";
  });
}

function setMatchImportState(state) {
  return updateConfig(config => {
    config.matchImportState = normalizeConfigValue("matchImportState", state);
  });
}

module.exports = {
  MATCH_IMPORT_STATE_VERSION,
  initializeConfigStore,
  readConfig,
  writeConfig,
  setTargetChannel1,
  setTargetChannel2,
  setPngChannel,
  setSourceChannelPart1,
  setSourceChannelPart2,
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
  setCommandDeploymentHash,
  setMatchImportState,
};
