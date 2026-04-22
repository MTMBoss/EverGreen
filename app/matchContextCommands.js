const {
  AttachmentBuilder,
  ChannelType,
} = require("discord.js");

const { readConfig } = require("../config/configStore");
const {
  extractMatchDate,
  getSeparatorActions,
  commitSeparatorState,
} = require("../matches/publicationTracker");
const { renderMatchImage } = require("../matches/matchImageRenderer");
const {
  buildPart1Message,
  buildPart2Draft,
  buildPart2Message,
  getImageAttachments,
  parseMatchMessage,
} = require("../matches/matchMessageParser");
const {
  createMatchDraftFromPart1,
  completeMatchFromPart2,
  buildMatchWebUrl,
} = require("../matches/matchService");

const WEEK_SEPARATOR_PATH =
  process.env.WEEK_SEPARATOR_PATH || "./separator-week.png";
const MONTH_SEPARATOR_PATH =
  process.env.MONTH_SEPARATOR_PATH || "./separator-month.png";
const DEFAULT_SEPARATOR_PATH =
  process.env.DEFAULT_SEPARATOR_PATH || "./separator.png";

async function sendWeekSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(WEEK_SEPARATOR_PATH)],
  });
}

async function sendMonthSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(MONTH_SEPARATOR_PATH)],
  });
}

async function sendDefaultSeparator(channel) {
  await channel.send({
    files: [new AttachmentBuilder(DEFAULT_SEPARATOR_PATH)],
  });
}

async function ensureDateSeparators(channel, dateLine) {
  const matchDate = extractMatchDate(dateLine);

  if (!matchDate) return false;

  const actions = getSeparatorActions(channel.id, matchDate);

  if (actions.monthChanged) {
    await sendMonthSeparator(channel);
    await sendWeekSeparator(channel);
  } else if (actions.weekChanged) {
    await sendWeekSeparator(channel);
  }

  commitSeparatorState(channel.id, matchDate);
  return true;
}

async function handleMatchContextCommand(interaction, client) {
  if (
    interaction.commandName !== "Prepara Parte 2" &&
    interaction.commandName !== "Pubblica Match" &&
    interaction.commandName !== "Pubblica PNG"
  ) {
    return false;
  }

  await interaction.deferReply({ flags: 64 });

  const message = interaction.targetMessage;
  const parsed = parseMatchMessage(message.content || "");

  if (interaction.commandName === "Prepara Parte 2") {
    await interaction.editReply({
      content: buildPart2Draft(parsed),
    });
    return true;
  }

  if (interaction.commandName === "Pubblica PNG") {
    const config = readConfig();
    const pngChannel = config.pngChannel
      ? await client.channels.fetch(config.pngChannel)
      : null;

    if (!pngChannel || pngChannel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "❌ Canale PNG non configurato correttamente.",
      });
      return true;
    }

    if (
      !parsed.title ||
      !parsed.dateLine ||
      !parsed.timeLine ||
      parsed.mapLines.length === 0
    ) {
      await interaction.editReply({
        content: "❌ Il messaggio non contiene dati sufficienti per generare il PNG.",
      });
      return true;
    }

    await ensureDateSeparators(pngChannel, parsed.dateLine);

    const imageBuffer = await renderMatchImage(parsed);

    await pngChannel.send({
      files: [
        new AttachmentBuilder(imageBuffer, {
          name: "match.png",
        }),
      ],
    });

    await interaction.editReply({
      content: `✅ PNG pubblicato in ${pngChannel}.`,
    });
    return true;
  }

  const config = readConfig();
  const images = getImageAttachments(message);
  const isPart2 = Boolean(parsed.resultLine);
  const isPart1 =
    !isPart2 &&
    Boolean(parsed.title) &&
    Boolean(parsed.dateLine) &&
    (Boolean(parsed.timeLine) || parsed.mapLines.length > 0);

  const part1Channel = config.targetChannel1
    ? await client.channels.fetch(config.targetChannel1)
    : null;
  const part2Channel = config.targetChannel2
    ? await client.channels.fetch(config.targetChannel2)
    : null;

  if (!isPart1 && !isPart2) {
    await interaction.editReply({
      content: "❌ Non ho trovato una parte valida nel messaggio selezionato.",
    });
    return true;
  }

  if (isPart1) {
    if (!part1Channel || part1Channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "❌ Canale parte 1 non configurato correttamente.",
      });
      return true;
    }

    await part1Channel.send({
      content: buildPart1Message(parsed),
    });

    await sendDefaultSeparator(part1Channel);
    const draftMatch = await createMatchDraftFromPart1({ parsed, message });
    const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, draftMatch.slug);

    await interaction.editReply({
      content: `✅ Pubblicato\n🔗 Scheda match: ${webUrl}`,
    });
    return true;
  }

  if (isPart2) {
    if (!part2Channel || part2Channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "❌ Canale parte 2 non configurato correttamente.",
      });
      return true;
    }

    await part2Channel.send({
      content: buildPart2Message(parsed),
      files: images.slice(0, 10).map(attachment => attachment.url),
    });

    await sendDefaultSeparator(part2Channel);

    const completed = await completeMatchFromPart2({
      parsed,
      message,
    });

    const extractionMessage =
      (completed.needsReview ? `\n🛠 Stato: da rivedere manualmente` : "") +
      (completed.extractionSummary
        ? `\nℹ️ ${completed.extractionSummary}`
        : "");
    const webUrl = buildMatchWebUrl(config.attendanceWebBaseUrl, completed.slug);

    await interaction.editReply({
      content: `✅ Pubblicato${extractionMessage}\n🔗 Scheda match aggiornata: ${webUrl}`,
    });
    return true;
  }

  await interaction.editReply({
    content: "✅ Pubblicato",
  });
  return true;
}

module.exports = {
  handleMatchContextCommand,
};
