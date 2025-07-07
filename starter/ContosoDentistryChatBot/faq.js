// faq.js
const axios = require('axios');

class FaqConnector {
  constructor(endpoint, key, project, deployment) {
    this.baseUrl = `${endpoint}language/:query-knowledgebases?api-version=2021-10-01&projectName=${project}&deploymentName=${deployment}`;
    this.key = key;
  }

  async ask(question, top = 1) {
    const resp = await axios.post(
      this.baseUrl,
      { question, top },
      { headers: { 'Ocp-Apim-Subscription-Key': this.key } }
    );
    return resp.data.answers;
  }
}

module.exports = FaqConnector;
