import serverless from "serverless-http";
import { buildServer } from "../../src/server.js";

// Static imports let Netlify bundle the CRM server and all of its runtime
// packages into this function, avoiding fragile paths to separate files.
let handlerPromise: Promise<ReturnType<typeof serverless>> | undefined;

async function apiHandler() {
  if (!handlerPromise) handlerPromise = buildServer().then((app) => serverless(app));
  return handlerPromise;
}

export const handler = async (event: Parameters<ReturnType<typeof serverless>>[0], context: Parameters<ReturnType<typeof serverless>>[1]) =>
  (await apiHandler())(event, context);
