import serverless from "serverless-http";
import { buildServer } from "../../src/server.js";

// Keep one Fastify instance warm while a Netlify function instance is reused.
// The static import is intentional: Netlify's bundler can then include the
// server source and all of its dependencies in the deployed function.
let handlerPromise: Promise<ReturnType<typeof serverless>> | undefined;

async function apiHandler() {
  if (!handlerPromise) {
    handlerPromise = buildServer().then((app) => serverless(app));
  }
  return handlerPromise;
}

export const handler = async (event: Parameters<ReturnType<typeof serverless>>[0], context: Parameters<ReturnType<typeof serverless>>[1]) =>
  (await apiHandler())(event, context);
