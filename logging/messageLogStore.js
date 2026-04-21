const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const MESSAGE_STORE_PATH = path.join(DATA_DIR, "messageLogs.json");
const CHANNEL_MAP_PATH = path.join(DATA_DIR, "logChannelMap.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureFile(filePath, defaultValue) {
  ensureDir();

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

function readJson(filePath, defaultValue) {
  ensureFile(filePath, defaultValue);

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`❌ Errore lettura ${filePath}:`, error);
    return defaultValue;
  }
}

function writeJson(filePath, value) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readMessageStore() {
  return readJson(MESSAGE_STORE_PATH, {});
}

function writeMessageStore(data) {
  writeJson(MESSAGE_STORE_PATH, data);
}

function readChannelMap() {
  return readJson(CHANNEL_MAP_PATH, {});
}

function writeChannelMap(data) {
  writeJson(CHANNEL_MAP_PATH, data);
}

function upsertMessageLog(entry) {
  const store = readMessageStore();
  store[entry.messageId] = {
    ...store[entry.messageId],
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  writeMessageStore(store);
  return store[entry.messageId];
}

function getMessageLog(messageId) {
  const store = readMessageStore();
  return store[messageId] || null;
}

function deleteMessageLog(messageId) {
  const store = readMessageStore();
  const existing = store[messageId] || null;
  delete store[messageId];
  writeMessageStore(store);
  return existing;
}

function setLogChannelId(guildId, sourceChannelId, logChannelId) {
  const map = readChannelMap();

  if (!map[guildId]) {
    map[guildId] = {};
  }

  map[guildId][sourceChannelId] = logChannelId;
  writeChannelMap(map);

  return logChannelId;
}

function getLogChannelId(guildId, sourceChannelId) {
  const map = readChannelMap();
  return map[guildId]?.[sourceChannelId] || null;
}

module.exports = {
  upsertMessageLog,
  getMessageLog,
  deleteMessageLog,
  setLogChannelId,
  getLogChannelId,
};
