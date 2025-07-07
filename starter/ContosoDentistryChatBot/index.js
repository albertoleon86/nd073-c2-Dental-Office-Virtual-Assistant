// index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const restify = require('restify');
const { BotFrameworkAdapter } = require('botbuilder');

// importa la clase exportada en bot.js
const DentistBot = require('./bot');          // o { DentistBot } según tu export

// instancia del bot
const myBot = new DentistBot();

// servidor HTTP
const server = restify.createServer();
server.listen(process.env.PORT || 8080, () => {
  console.log(`${server.name} listening on ${server.url}`);
});

// adapter de Bot Framework
const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword
});

// manejo de errores
adapter.onTurnError = async (context, error) => {
  console.error('[onTurnError]', error);
  await context.sendTraceActivity('OnTurnError', `${error}`);
  await context.sendActivity('El bot encontró un error.');
};

// endpoint REST
server.post('/api/messages', async (req, res) => {
  await adapter.processActivity(req, res, async (context) => {
    await myBot.run(context);
  });
});

// soporte WebSocket (opcional)
server.on('upgrade', (req, socket, head) => {
  const streamingAdapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
  });
  streamingAdapter.onTurnError = adapter.onTurnError;
  streamingAdapter.useWebSocket(req, socket, head, async (context) => {
    await myBot.run(context);
  });
});
