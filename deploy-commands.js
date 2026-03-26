require("dotenv").config();

const {
  REST,
  Routes,
  ApplicationCommandType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const commands = [
  {
    name: "Pubblica Match",
    type: ApplicationCommandType.Message,
  },
  {
    name: "Prepara Parte 2",
    type: ApplicationCommandType.Message,
  },

  new SlashCommandBuilder()
    .setName("set-canale-parte1")
    .setDescription("Imposta il canale di destinazione per la parte 1")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per la parte 1")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-parte2")
    .setDescription("Imposta il canale di destinazione per la parte 2")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per la parte 2")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canali-schedule")
    .setDescription("Imposta 1 o 2 canali per lo schedule settimanale")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale1")
        .setDescription("Primo canale schedule")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("canale2")
        .setDescription("Secondo canale schedule")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .toJSON(),
new SlashCommandBuilder()
  .setName("set-canale-annuncio-schedule")
  .setDescription("Imposta il canale dove pubblicare l'annuncio di uscita schedule")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(option =>
    option
      .setName("canale")
      .setDescription("Canale testuale per l'annuncio schedule")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .toJSON(),

new SlashCommandBuilder()
  .setName("set-ruoli-schedule")
  .setDescription("Imposta i ruoli da taggare quando esce lo schedule")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption(option =>
    option
      .setName("ruolo_obbligatorio")
      .setDescription("Ruolo obbligatorio")
      .setRequired(true)
  )
  .addRoleOption(option =>
    option
      .setName("ruolo_opzionale")
      .setDescription("Ruolo opzionale")
      .setRequired(false)
  )
  .toJSON(),

  new SlashCommandBuilder()
    .setName("mostra-config")
    .setDescription("Mostra la configurazione attuale del bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Comandi registrati correttamente");
  } catch (error) {
    console.error("❌ Errore registrazione comandi:", error);
  }
})();