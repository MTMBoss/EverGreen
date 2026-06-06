const { syncTrackedMembers } = require("./attendanceRepository");
const { readConfig } = require("../config/configStore");

async function syncRosterFromGuild(guild) {
    if (!guild) {
        throw new Error("Guild non disponibile.");
    }

    const config = readConfig();
    const trackedRoleIds = config.attendanceRoleIds || [];

    if (trackedRoleIds.length === 0) {
        throw new Error("Ruoli presenze non configurati. Usa /set-ruoli-presenze.");
    }

    await guild.members.fetch();

    const trackedMembers = [];

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const matchedRoles = trackedRoleIds
            .map(roleId => member.roles.cache.get(roleId))
            .filter(Boolean)
            .map(role => ({ roleId: role.id, roleName: role.name }));

        if (matchedRoles.length === 0) continue;

        trackedMembers.push({
            discord_user_id: member.id,
            nickname: member.nickname || "",
            display_name:
                member.displayName ||
                member.user.globalName ||
                member.user.username ||
                member.user.tag,
            tracked_roles: matchedRoles,
        });
    }

    trackedMembers.sort((a, b) => {
        const left = (a.nickname || a.display_name).toLowerCase();
        const right = (b.nickname || b.display_name).toLowerCase();
        return left.localeCompare(right, "it");
    });

    await syncTrackedMembers(trackedMembers, new Date().toISOString());

    return {
        trackedRoleIds,
        count: trackedMembers.length,
        members: trackedMembers,
    };
}

module.exports = {
    syncRosterFromGuild,
};
