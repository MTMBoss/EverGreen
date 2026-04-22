const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const { ChannelType } = require("discord.js");

const { readConfig } = require("../config/configStore");

dayjs.extend(customParseFormat);

const SCHEDULE_EMOJIS = ["1️⃣", "2️⃣", "3️⃣"];
const SLOT_KEYS = ["slot_21_22", "slot_22_23", "slot_23_00"];

function makeEmptyDeclaration() {
  return {
    slot_21_22: false,
    slot_22_23: false,
    slot_23_00: false,
  };
}

function countDeclaredSlots(declaration) {
  return SLOT_KEYS.reduce((count, key) => count + (declaration?.[key] ? 1 : 0), 0);
}

async function getScheduleAvailabilityForDate(client, dateInput) {
  const config = readConfig();
  const currentSchedule = config.currentSchedule;
  const date = dayjs(dateInput, "YYYY-MM-DD", true);
  const weekStart = dayjs(currentSchedule?.weekStart || "", "YYYY-MM-DD", true);

  if (!client?.user || !currentSchedule || !weekStart.isValid() || !date.isValid()) {
    return makeEmptyAvailability(dateInput);
  }

  const dayIndex = date.diff(weekStart, "day");
  if (dayIndex < 0 || dayIndex > 6) {
    return makeEmptyAvailability(dateInput);
  }

  const declarationsByUserId = new Map();

  for (const [channelId, messageIds] of Object.entries(currentSchedule.channels || {})) {
    const messageId = Array.isArray(messageIds) ? messageIds[dayIndex] : null;
    if (!messageId) continue;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        continue;
      }

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        continue;
      }

      for (let emojiIndex = 0; emojiIndex < SCHEDULE_EMOJIS.length; emojiIndex += 1) {
        const emoji = SCHEDULE_EMOJIS[emojiIndex];
        const reaction = message.reactions.cache.find(item => item.emoji.name === emoji);
        if (!reaction) continue;

        const users = await reaction.users.fetch();
        for (const user of users.values()) {
          if (!user || user.bot || user.id === client.user.id) continue;

          const existing = declarationsByUserId.get(user.id) || makeEmptyDeclaration();
          existing[SLOT_KEYS[emojiIndex]] = true;
          declarationsByUserId.set(user.id, existing);
        }
      }
    } catch (error) {
      console.error(`❌ Errore leggendo availability schedule da ${channelId}:`, error.message || error);
    }
  }

  const slotCounts = {
    slot_21_22: 0,
    slot_22_23: 0,
    slot_23_00: 0,
  };

  for (const declaration of declarationsByUserId.values()) {
    for (const key of SLOT_KEYS) {
      if (declaration[key]) {
        slotCounts[key] += 1;
      }
    }
  }

  return {
    date: dateInput,
    trackedWeekStart: weekStart.format("YYYY-MM-DD"),
    hasScheduleData: declarationsByUserId.size > 0,
    declaredCount: declarationsByUserId.size,
    slotCounts,
    byUserId: Object.fromEntries(declarationsByUserId.entries()),
  };
}

function makeEmptyAvailability(dateInput) {
  return {
    date: dateInput,
    trackedWeekStart: "",
    hasScheduleData: false,
    declaredCount: 0,
    slotCounts: {
      slot_21_22: 0,
      slot_22_23: 0,
      slot_23_00: 0,
    },
    byUserId: {},
  };
}

module.exports = {
  getScheduleAvailabilityForDate,
  makeEmptyDeclaration,
  countDeclaredSlots,
};
