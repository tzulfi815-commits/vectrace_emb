const serverless = require("serverless-http");

// The Fastify server is compiled as ESM. Load it dynamically from the backend
// build included with this function (see `included_files` in netlify.toml).
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
