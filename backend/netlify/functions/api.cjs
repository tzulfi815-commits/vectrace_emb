const serverless = require("serverless-http");

// Netlify's Lambda wrapper loads CommonJS functions. The CRM itself is ESM,
// so load the compiled Fastify server with a dynamic import.
let handlerPromise;

async function apiHandler() {
  if (!handlerPromise) {
    handlerPromise = import("../../dist/server.js")
      .then(({ buildServer }) => buildServer())
      .then((app) => serverless(app));
  }
  return handlerPromise;
}

exports.handler = async (event, context) => (await apiHandler())(event, context);
