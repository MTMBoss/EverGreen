const { Client, GatewayIntentBits } = require('discord.js');
const { registraEventoPronto } = require('./eventi/pronto');
const { registraEventoCreazioneInterazione } = require('./eventi/creazioneInterazione');

function createBotClient() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  registraEventoPronto(client);
  registraEventoCreazioneInterazione(client);

  return client;
}

module.exports = {
  createBotClient,
};
