import serverless from "serverless-http";
import { buildServer } from "../../dist/server.js";

// Netlify keeps a warm function instance when possible. Reuse the Fastify app
// and its Supabase/R2 clients instead of rebuilding them on every request.
let handlerPromise;

async function apiHandler() {
  if (!handlerPromise) {
    handlerPromise = buildServer().then((app) => serverless(app));
  }
  return handlerPromise;
}

export const handler = async (event, context) => (await apiHandler())(event, context);
