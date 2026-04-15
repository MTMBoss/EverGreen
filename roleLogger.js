const {
    ChannelType,
    PermissionsBitField,
    AuditLogEvent,
    EmbedBuilder,
} = require("discord.js");

const { getFixedLogsCategory } = require("./channelLogger");

const ROLE_LOG_CHANNEL_NAME = "log-roles";

async function ensureRoleLogChannel(guild) {
    const category = await getFixedLogsCategory(guild);

    let channel = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildText &&
            c.parentId === category.id &&
            c.name === ROLE_LOG_CHANNEL_NAME
    );

    if (!channel) {
        channel = await guild.channels.create({
            name: ROLE_LOG_CHANNEL_NAME,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: "Log automatici relativi ai ruoli del server",
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
            ],
            reason: "Creazione canale log ruoli",
        });
    }

    return channel;
}

async function fetchRecentAuditExecutor(guild, type, targetId) {
    try {
        const audits = await guild.fetchAuditLogs({ type, limit: 6 });
        const now = Date.now();

        const entry = audits.entries.find(entry => {
            const entryTargetId = entry.target?.id || null;
            const ageMs = now - entry.createdTimestamp;
            return entryTargetId === targetId && ageMs < 30_000;
        });

        return entry || null;
    } catch (error) {
        console.error("❌ Errore lettura audit logs:", error);
        return null;
    }
}

function roleSummary(role) {
    return [
        `Nome: ${role.name}`,
        `ID: \`${role.id}\``,
        `Colore: ${role.hexColor || "#000000"}`,
        `Posizione: ${role.position}`,
        `Menzionabile: ${role.mentionable ? "sì" : "no"}`,
        `Separato: ${role.hoist ? "sì" : "no"}`,
    ].join("\n");
}

function permissionsSummary(role) {
    const perms = role.permissions.toArray();
    if (perms.length === 0) return "Nessun permesso speciale";
    return perms.map(p => `• ${p}`).join("\n").slice(0, 1024);
}

function diffRoleFields(oldRole, newRole) {
    const changes = [];

    if (oldRole.name !== newRole.name) {
        changes.push(`Nome: **${oldRole.name}** → **${newRole.name}**`);
    }
    if (oldRole.hexColor !== newRole.hexColor) {
        changes.push(`Colore: **${oldRole.hexColor}** → **${newRole.hexColor}**`);
    }
    if (oldRole.position !== newRole.position) {
        changes.push(`Posizione: **${oldRole.position}** → **${newRole.position}**`);
    }
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(`Separato: **${oldRole.hoist ? "sì" : "no"}** → **${newRole.hoist ? "sì" : "no"}**`);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`Menzionabile: **${oldRole.mentionable ? "sì" : "no"}** → **${newRole.mentionable ? "sì" : "no"}**`);
    }

    const oldPerms = new Set(oldRole.permissions.toArray());
    const newPerms = new Set(newRole.permissions.toArray());

    const addedPerms = [...newPerms].filter(p => !oldPerms.has(p));
    const removedPerms = [...oldPerms].filter(p => !newPerms.has(p));

    if (addedPerms.length) {
        changes.push(`Permessi aggiunti:\n${addedPerms.map(p => `• ${p}`).join("\n")}`);
    }

    if (removedPerms.length) {
        changes.push(`Permessi rimossi:\n${removedPerms.map(p => `• ${p}`).join("\n")}`);
    }

    return changes.length ? changes.join("\n\n") : "Nessuna differenza rilevata";
}

function memberLabel(member) {
    return `${member.user?.tag || member.displayName}\n\`${member.id}\``;
}

function roleListText(roles) {
    if (!roles || roles.length === 0) return "Nessuno";
    return roles.map(role => `${role} (\`${role.id}\`)`).join("\n");
}

async function handleRoleCreate(role) {
    const channel = await ensureRoleLogChannel(role.guild);
    const audit = await fetchRecentAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);

    const embed = new EmbedBuilder()
        .setTitle("🟢 Ruolo creato")
        .addFields(
            {
                name: "Ruolo",
                value: roleSummary(role),
            },
            {
                name: "Permessi",
                value: permissionsSummary(role),
            },
            {
                name: "Creato da",
                value: audit?.executor
                    ? `${audit.executor.tag}\n\`${audit.executor.id}\``
                    : "Non trovato",
            }
        )
        .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
}

async function handleRoleDelete(role) {
    const channel = await ensureRoleLogChannel(role.guild);
    const audit = await fetchRecentAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);

    const embed = new EmbedBuilder()
        .setTitle("🔴 Ruolo eliminato")
        .addFields(
            {
                name: "Ruolo eliminato",
                value: roleSummary(role),
            },
            {
                name: "Eliminato da",
                value: audit?.executor
                    ? `${audit.executor.tag}\n\`${audit.executor.id}\``
                    : "Non trovato",
            }
        )
        .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
}

async function handleRoleUpdate(oldRole, newRole) {
    const channel = await ensureRoleLogChannel(newRole.guild);
    const audit = await fetchRecentAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

    const embed = new EmbedBuilder()
        .setTitle("🟡 Ruolo modificato")
        .addFields(
            {
                name: "Ruolo",
                value: `${newRole.name}\n\`${newRole.id}\``,
            },
            {
                name: "Modifiche",
                value: diffRoleFields(oldRole, newRole).slice(0, 1024),
            },
            {
                name: "Modificato da",
                value: audit?.executor
                    ? `${audit.executor.tag}\n\`${audit.executor.id}\``
                    : "Non trovato",
            }
        )
        .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
}

async function handleMemberRoleChanges(oldMember, newMember) {
    const oldRoles = new Set(
        oldMember.roles.cache
            .filter(role => role.id !== oldMember.guild.id)
            .map(role => role.id)
    );
    const newRoles = new Set(
        newMember.roles.cache
            .filter(role => role.id !== newMember.guild.id)
            .map(role => role.id)
    );

    const addedRoles = [...newRoles]
        .filter(id => !oldRoles.has(id))
        .map(id => newMember.guild.roles.cache.get(id))
        .filter(Boolean);

    const removedRoles = [...oldRoles]
        .filter(id => !newRoles.has(id))
        .map(id => newMember.guild.roles.cache.get(id) || oldMember.guild.roles.cache.get(id))
        .filter(Boolean);

    if (addedRoles.length === 0 && removedRoles.length === 0) {
        return;
    }

    const channel = await ensureRoleLogChannel(newMember.guild);
    const audit = await fetchRecentAuditExecutor(
        newMember.guild,
        AuditLogEvent.MemberRoleUpdate,
        newMember.id
    );

    const fields = [
        {
            name: "Membro",
            value: memberLabel(newMember),
        },
        {
            name: "Ruoli aggiunti",
            value: roleListText(addedRoles),
            inline: true,
        },
        {
            name: "Ruoli rimossi",
            value: roleListText(removedRoles),
            inline: true,
        },
        {
            name: "Azione eseguita da",
            value: audit?.executor
                ? `${audit.executor.tag}\n\`${audit.executor.id}\``
                : "Non trovato",
        },
    ];

    const embed = new EmbedBuilder()
        .setTitle("🔁 Ruoli membro aggiornati")
        .addFields(fields)
        .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
}

module.exports = {
    handleRoleCreate,
    handleRoleDelete,
    handleRoleUpdate,
    handleMemberRoleChanges,
};
