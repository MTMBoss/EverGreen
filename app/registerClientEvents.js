const { Events } = require("discord.js");

const { readConfig } = require("../config/configStore");
const {
  handleMessageCreate,
  handleMessageUpdate,
  handleMessageDelete,
} = require("../logging/channelLogger");
const {
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleMemberRoleChanges,
} = require("../logging/roleLogger");
const {
  startAttendanceLeaderboardScheduler,
  runAttendanceLeaderboardUpdate,
} = require("../attendance/attendanceLeaderboardScheduler");
const {
  handleAttendanceSlashCommand,
  handleAttendanceComponent,
  isAttendanceCommand,
} = require("../attendance/attendanceDiscord");
const {
  startAttendanceReminderScheduler,
  startAttendanceRosterSyncScheduler,
} = require("../attendance/attendanceScheduler");
const { scheduleRosterSync, runRosterSync } = require("../attendance/rosterAutoSync");
const { startAttendanceWebServer } = require("../web/server");
const { createMatchTables } = require("../matches/matchRepository");
const {
  handleAutoMatchSourceMessage,
  handleAutoMatchSourceDelete,
} = require("../matches/autoMatchImporter");
const { startScheduler } = require("../schedule/scheduler");
const { handleMatchContextCommand } = require("./matchContextCommands");
const { handleConfigCommand } = require("./configCommands");

function registerClientEvents(client) {
  client.once(Events.ClientReady, async () => {
    console.log(`✅ Loggato come ${client.user.tag}`);
    startScheduler(client);
    startAttendanceReminderScheduler(client);
    startAttendanceRosterSyncScheduler(client);
    startAttendanceWebServer(client);
    await createMatchTables();
    startAttendanceLeaderboardScheduler(client);

    queueMicrotask(async () => {
      try {
        const guilds = [...client.guilds.cache.values()];

        await Promise.all(
          guilds.map(guild =>
            runRosterSync(guild, "startup_initial_sync", {
              updateLeaderboard: false,
            })
          )
        );

        await runAttendanceLeaderboardUpdate(
          client,
          "roster_auto_sync:startup_initial_sync_batch"
        );
      } catch (error) {
        console.error(
          "❌ Errore batch startup sync roster/leaderboard:",
          error
        );
      }
    });
  });

  client.on(Events.GuildMemberAdd, member => {
    scheduleRosterSync(member.guild, "member_add");
  });

  client.on(Events.GuildMemberRemove, member => {
    scheduleRosterSync(member.guild, "member_remove");
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const config = readConfig();
      const trackedRoleIds = config.attendanceRoleIds || [];

      await handleMemberRoleChanges(oldMember, newMember);

      if (trackedRoleIds.length === 0) return;

      const oldTracked = trackedRoleIds.some(roleId =>
        oldMember.roles.cache.has(roleId)
      );
      const newTracked = trackedRoleIds.some(roleId =>
        newMember.roles.cache.has(roleId)
      );

      const nicknameChanged =
        (oldMember.nickname || "") !== (newMember.nickname || "");
      const displayNameChanged =
        (oldMember.displayName || "") !== (newMember.displayName || "");

      if (oldTracked !== newTracked || nicknameChanged || displayNameChanged) {
        scheduleRosterSync(newMember.guild, "member_update");
      }
    } catch (error) {
      console.error("❌ Errore GuildMemberUpdate roster sync:", error);
    }
  });

  client.on(Events.GuildRoleCreate, async role => {
    try {
      await handleRoleCreate(role);
    } catch (error) {
      console.error("❌ Errore logger roleCreate:", error);
    }
  });

  client.on(Events.GuildRoleDelete, async role => {
    try {
      await handleRoleDelete(role);
    } catch (error) {
      console.error("❌ Errore logger roleDelete:", error);
    }
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    try {
      await handleRoleUpdate(oldRole, newRole);
    } catch (error) {
      console.error("❌ Errore logger roleUpdate:", error);
    }
  });

  client.on(Events.MessageCreate, async message => {
    try {
      await handleAutoMatchSourceMessage(message, client);
      await handleMessageCreate(message);
    } catch (error) {
      console.error("❌ Errore logger messageCreate:", error);
    }
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      await handleMessageUpdate(oldMessage, newMessage);
    } catch (error) {
      console.error("❌ Errore logger messageUpdate:", error);
    }
  });

  client.on(Events.MessageDelete, async message => {
    try {
      await handleAutoMatchSourceDelete(message);
      await handleMessageDelete(message);
    } catch (error) {
      console.error("❌ Errore logger messageDelete:", error);
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    let deferred = false;

    try {
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const handled = await handleAttendanceComponent(interaction);
        if (handled) return;
      }

      if (interaction.isMessageContextMenuCommand()) {
        await handleMatchContextCommand(interaction, client);
        return;
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      const isPublicLeaderboard =
        interaction.commandName === "leaderboard-presenze";

      if (isPublicLeaderboard) {
        await interaction.deferReply();
      } else {
        await interaction.deferReply({ flags: 64 });
      }

      deferred = true;

      if (isAttendanceCommand(interaction.commandName)) {
        await handleAttendanceSlashCommand(interaction, client);
        return;
      }

      const handled = await handleConfigCommand(interaction);
      if (handled) return;
    } catch (error) {
      console.error("❌ Errore:", error);

      if (!deferred && !interaction.deferred && !interaction.replied) {
        return;
      }

      try {
        await interaction.editReply({
          content: `❌ Errore durante il comando. ${error.message || ""}`.trim(),
        });
      } catch {
        // noop
      }
    }
  });
}

module.exports = {
  registerClientEvents,
};
