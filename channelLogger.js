const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const {
  upsertMessageLog,
  getMessageLog,
  setLogChannelId,
  getLogChannelId,
} = require("./messageLogStore");

const LOG_CATEGORY_ID = "1490082824605401219";
const LOG_CHANNEL_PREFIX = "log-";

function sanitizeChannelName(name) {
  return String(name || "canale")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function isSupportedSourceChannel(channel) {
  if (!channel) return false;

  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  );
}

function isLogChannel(channel) {
  return Boolean(channel?.name?.startsWith(LOG_CHANNEL_PREFIX));
}

function attachmentList(message) {
  return [...message.attachments.values()].map(att => ({
    name: att.name || "file",
    url: att.url,
    contentType: att.contentType || null,
    size: att.size || 0,
  }));
}

function formatAttachmentLines(attachments) {
  if (!attachments || attachments.length === 0) {
    return "Nessun allegato";
  }

  return attachments
    .map(a => `• ${a.name || "file"}\n${a.url}`)
    .join("\n");
}

function clip(text, max = 1024) {
  const value = String(text ?? "");
  if (value.length <= max) return value || "*vuoto*";
  return `${value.slice(0, max - 3)}...`;
}

async function getFixedLogsCategory(guild) {
  const category = await guild.channels.fetch(LOG_CATEGORY_ID).catch(() => null);

  if (!category) {
    throw new Error(
      `Categoria log non trovata: ${LOG_CATEGORY_ID}. Controlla che esista nel server giusto.`
    );
  }

  if (category.type !== ChannelType.GuildCategory) {
    throw new Error(
      `Il canale ${LOG_CATEGORY_ID} esiste ma non è una categoria.`
    );
  }

  return category;
}

async function ensureLogChannel(sourceChannel) {
  const guild = sourceChannel.guild;

  const savedId = getLogChannelId(guild.id, sourceChannel.id);
  if (savedId) {
    const saved = guild.channels.cache.get(savedId) || await guild.channels.fetch(savedId).catch(() => null);
    if (saved) return saved;
  }

  const category = await getFixedLogsCategory(guild);
  const desiredName = `${LOG_CHANNEL_PREFIX}${sanitizeChannelName(sourceChannel.name)}`;

  let logChannel = guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.parentId === category.id &&
      c.name === desiredName
  );

  if (!logChannel) {
    logChannel = await guild.channels.create({
      name: desiredName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Log automatico del canale sorgente #${sourceChannel.name}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
      ],
      reason: `Creazione log per ${sourceChannel.name}`,
    });
  }

  setLogChannelId(guild.id, sourceChannel.id, logChannel.id);
  return logChannel;
}

async function sendLongTextFile(channel, filename, content) {
  const buffer = Buffer.from(String(content ?? ""), "utf8");
  const file = new AttachmentBuilder(buffer, { name: filename });
  await channel.send({ files: [file] });
}

function buildBaseFields(message, saved) {
  const authorTag = saved?.authorTag || message.author?.tag || "*non disponibile*";
  const authorId = saved?.authorId || message.author?.id || "*non disponibile*";
  const createdAt =
    saved?.createdAt ||
    message.createdAt?.toISOString?.() ||
    new Date().toISOString();

  return [
    {
      name: "Autore",
      value: `${authorTag}\n\`${authorId}\``,
      inline: false,
    },
    {
      name: "Canale sorgente",
      value: `<#${saved?.channelId || message.channel?.id}>`,
      inline: true,
    },
    {
      name: "Messaggio ID",
      value: `\`${message.id}\``,
      inline: true,
    },
    {
      name: "Creato il",
      value: `\`${createdAt}\``,
      inline: false,
    },
  ];
}

async function handleMessageCreate(message) {
  if (!message.guild || !isSupportedSourceChannel(message.channel)) return;
  if (message.author?.bot) return;
  if (isLogChannel(message.channel)) return;

  const attachments = attachmentList(message);

  upsertMessageLog({
    messageId: message.id,
    guildId: message.guild.id,
    guildName: message.guild.name,
    channelId: message.channel.id,
    channelName: message.channel.name,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || "",
    attachments,
    createdAt: message.createdAt.toISOString(),
    deleted: false,
  });

  const logChannel = await ensureLogChannel(message.channel);

  const embed = new EmbedBuilder()
    .setTitle("🟢 Messaggio inviato")
    .addFields(
      ...buildBaseFields(message, null),
      {
        name: "Contenuto",
        value: clip(message.content || "*vuoto*"),
      },
      {
        name: "Allegati",
        value: clip(formatAttachmentLines(attachments)),
      }
    )
    .setTimestamp(new Date());

  await logChannel.send({ embeds: [embed] });

  if ((message.content || "").length > 1024) {
    await sendLongTextFile(
      logChannel,
      `message-${message.id}.txt`,
      message.content || ""
    );
  }
}

async function handleMessageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild || !isSupportedSourceChannel(newMessage.channel)) return;
  if (newMessage.author?.bot) return;
  if (isLogChannel(newMessage.channel)) return;

  const saved = getMessageLog(newMessage.id);
  const oldContent = saved?.content ?? oldMessage.content ?? "";
  const newContent = newMessage.content ?? "";
  const attachments = attachmentList(newMessage);

  upsertMessageLog({
    messageId: newMessage.id,
    guildId: newMessage.guild.id,
    guildName: newMessage.guild.name,
    channelId: newMessage.channel.id,
    channelName: newMessage.channel.name,
    authorId: newMessage.author?.id || saved?.authorId || "",
    authorTag: newMessage.author?.tag || saved?.authorTag || "",
    content: newContent,
    attachments,
    createdAt:
      saved?.createdAt ||
      newMessage.createdAt?.toISOString?.() ||
      new Date().toISOString(),
    editedAt: new Date().toISOString(),
    deleted: false,
  });

  const logChannel = await ensureLogChannel(newMessage.channel);

  const embed = new EmbedBuilder()
    .setTitle("🟡 Messaggio modificato")
    .addFields(
      ...buildBaseFields(newMessage, saved),
      {
        name: "Prima",
        value: clip(oldContent || "*vuoto*"),
      },
      {
        name: "Dopo",
        value: clip(newContent || "*vuoto*"),
      }
    )
    .setTimestamp(new Date());

  await logChannel.send({ embeds: [embed] });

  if ((oldContent || "").length > 1024) {
    await sendLongTextFile(
      logChannel,
      `before-edit-${newMessage.id}.txt`,
      oldContent || ""
    );
  }

  if ((newContent || "").length > 1024) {
    await sendLongTextFile(
      logChannel,
      `after-edit-${newMessage.id}.txt`,
      newContent || ""
    );
  }
}

async function handleMessageDelete(message) {
  if (!message.guild || !isSupportedSourceChannel(message.channel)) return;
  if (isLogChannel(message.channel)) return;

  const saved = getMessageLog(message.id);

  const logChannel = await ensureLogChannel(message.channel);

  const embed = new EmbedBuilder()
    .setTitle("🔴 Messaggio eliminato")
    .addFields(
      ...buildBaseFields(message, saved),
      {
        name: "Contenuto salvato",
        value: clip(saved?.content || "*non disponibile*"),
      },
      {
        name: "Allegati salvati",
        value: clip(formatAttachmentLines(saved?.attachments || [])),
      }
    )
    .setTimestamp(new Date());

  await logChannel.send({ embeds: [embed] });

  if ((saved?.content || "").length > 1024) {
    await sendLongTextFile(
      logChannel,
      `deleted-message-${message.id}.txt`,
      saved.content
    );
  }

  if (saved) {
    upsertMessageLog({
      ...saved,
      deleted: true,
      deletedAt: new Date().toISOString(),
    });
  }
}

async function syncAllGuildTextChannels(guild) {
  const channels = guild.channels.cache.filter(
    channel =>
      channel.type === ChannelType.GuildText &&
      !isLogChannel(channel)
  );

  const created = [];

  for (const [, channel] of channels) {
    const logChannel = await ensureLogChannel(channel);
    created.push({
      source: channel.name,
      log: logChannel.name,
    });
  }

  return created;
}

module.exports = {
  handleMessageCreate,
  handleMessageUpdate,
  handleMessageDelete,
  syncAllGuildTextChannels,
};
