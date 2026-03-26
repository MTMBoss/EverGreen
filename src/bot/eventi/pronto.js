const { Events } = require('discord.js');
const { startScheduler } = require('../../features/schedule/scheduler');

function registraEventoPronto(client) {
  client.once(Events.ClientReady, () => {
    console.log(`✅ Loggato come ${client.user.tag}`);
    startScheduler(client);
  });
}

module.exports = {
  registraEventoPronto,
};
