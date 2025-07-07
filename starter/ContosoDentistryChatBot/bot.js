// bot.js ──────────────────────────────────────────────────────────────
// Contoso Dentistry Virtual Assistant
// FAQ  • Custom Question Answering  (REST)
// CLU  • Conversational Language (intents + entities)
// API  • Dentist Scheduler  (/availability  /schedule)
// ──────────────────────────────────────────────────────────────────────

/* ── Imports ──────────────────────────────────────────────────────── */
const { ActivityHandler, MessageFactory } = require('botbuilder');
const axios = require('axios');
const {
  ConversationAnalysisClient,
  AzureKeyCredential
} = require('@azure/ai-language-conversations');

/* ── FAQ wrapper (REST) ───────────────────────────────────────────── */
class FaqConnector {
  constructor(endpoint, key, project, deployment) {
    this.baseURL = `${endpoint}language/:query-knowledgebases`;
    this.headers = { 'Ocp-Apim-Subscription-Key': key };
    this.params  = {
      'api-version': '2021-10-01',
      projectName: project,
      deploymentName: deployment
    };
  }
  async ask(question, top = 1) {
    const { data } = await axios.post(
      this.baseURL,
      { question, top },
      { headers: this.headers, params: this.params }
    );
    return data.answers ?? [];
  }
}

/* ── DentistBot ───────────────────────────────────────────────────── */
class DentistBot extends ActivityHandler {
  constructor() {
    super();

    /* CLU client */
    this.clu = new ConversationAnalysisClient(
      process.env.CLU_ENDPOINT,
      new AzureKeyCredential(process.env.CLU_KEY)
    );

    /* FAQ client */
    this.faq = new FaqConnector(
      process.env.QA_ENDPOINT,
      process.env.QA_KEY,
      process.env.QA_PROJECT,
      process.env.QA_DEPLOYMENT
    );

    /* Scheduler client */
    this.scheduler = axios.create({
      baseURL: process.env.SCHEDULER_API_URL,
      headers: { 'Content-Type': 'application/json' }
    });

    /* In-memory flag  */
    this.awaitingDate = new Set();          // conversation.id → expecting date-time

    /* ── MESSAGES ─────────────────────────────────────────────────── */
    this.onMessage(async (context, next) => {
      const convId   = context.activity.conversation.id;
      const userText = context.activity.text?.trim();
      if (!userText) return next();

      /* 0️⃣  Was the bot waiting for a date? ------------------------ */
      if (this.awaitingDate.has(convId)) {
        this.awaitingDate.delete(convId);
        try {
          const payload = { dateTime: userText, name: context.activity.from.name ?? 'patient' };
          const { data } = await this.scheduler.post('/schedule', payload);
          await context.sendActivity(`✅ Your appointment is booked for **${data.dateTime}**.`);
        } catch (err) {
          console.error('Scheduler POST error', err.message);
          await context.sendActivity('Sorry, I could not book that appointment right now.');
        }
        return next();
      }

      let topIntent = 'None';
      let score     = 0;
      let entities  = [];
      let answers   = [];

      /* 1️⃣  CLU ----------------------------------------------------- */
      try {
        const res = await this.clu.analyzeConversation({
          kind: 'Conversation',
          analysisInput: {
            conversationItem: {
              text: userText,
              id: context.activity.id,
              participantId: context.activity.from.id
            }
          },
          parameters: {
            projectName: process.env.CLU_PROJECT,
            deploymentName: process.env.CLU_DEPLOYMENT,
            verbose: true
          }
        });

        const pred        = res.result.prediction;
        const intentClean = pred.topIntent.trim();
        topIntent         = intentClean;

        if (Array.isArray(pred.intents)) {
          const it = pred.intents.find(i => i.category.trim() === intentClean);
          score = it?.confidenceScore ?? it?.confidence ?? 0;
        } else if (pred.intents?.[intentClean]) {
          const it = pred.intents[intentClean];
          score = it.confidenceScore ?? it.confidence ?? 0;
        }
        entities = pred.entities ?? [];
      } catch (err) {
        console.error('CLU error →', err.message);
      }

      /* 2️⃣  FAQ ----------------------------------------------------- */
      try {
        answers = await this.faq.ask(userText, 1);
      } catch (err) {
        console.error('FAQ error →', err.message);
      }

      /* Trace for debugging */
      console.log(
        `[TRACE] "${userText}" | CLU ${topIntent} ${score.toFixed(2)} | FAQ ${(answers[0]?.confidenceScore ?? 0).toFixed(2)}`
      );

      /* 2️⃣.1  FAQ takes precedence --------------------------------- */
      const faqScore = answers.length
        ? (answers[0].confidenceScore ?? answers[0].confidence ?? 0)
        : 0;
      if (faqScore >= 0.25) {
        await context.sendActivity(answers[0].answer);
        return next();
      }

      /* 3️⃣  Availability ------------------------------------------- */
      if (topIntent === 'GetAvailability' && score >= 0.5) {
        try {
          const { data: hours } = await this.scheduler.get('/availability');
          await context.sendActivity(`These time slots are available: ${hours.join(', ')}`);
        } catch (err) {
          console.error('Scheduler GET error', err.message);
          await context.sendActivity('Sorry, I could not retrieve availability right now.');
        }
        return next();
      }

      /* 4️⃣  Schedule appointment ----------------------------------- */
      if (topIntent === 'ScheduleAppointment' && score >= 0.5) {
        const dt = entities.find(e => ['DateTime', 'Datetime', 'datetimeV2'].includes(e.category));
        if (!dt) {
          this.awaitingDate.add(convId);
          await context.sendActivity('Sure — for what date and time?');
        } else {
          try {
            const payload = { dateTime: dt.text, name: context.activity.from.name ?? 'patient' };
            const { data } = await this.scheduler.post('/schedule', payload);
            await context.sendActivity(`✅ Your appointment is booked for **${data.dateTime}**.`);
          } catch (err) {
            console.error('Scheduler POST error', err.message);
            await context.sendActivity('Sorry, I could not book that appointment right now.');
          }
        }
        return next();
      }

      /* 5️⃣  Fallback ---------------------------------------------- */
      await context.sendActivity("Sorry, I don't have that information yet.");
      await next();
    });

    /* ── Welcome ─────────────────────────────────────────────────── */
    this.onMembersAdded(async (context, next) => {
      const welcome =
        '👋 Welcome to **Contoso Dentistry**!\n\n' +
        'I can:\n' +
        '• Answer common questions\n' +
        '• Show available appointment slots\n' +
        '• Book your appointment\n\n' +
        '**Try asking**:\n' +
        '• “I don’t have insurance. Can I still be seen?”\n' +
        '• “Do you have appointments tomorrow?”\n' +
        '• “Book me Friday at 10 a.m.”';

      for (const m of context.activity.membersAdded) {
        if (m.id !== context.activity.recipient.id) {
          await context.sendActivity(MessageFactory.text(welcome));
        }
      }
      await next();
    });
  }
}

module.exports = DentistBot;

