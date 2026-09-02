import webpush from "web-push";
import { env } from "./environment.js";
import type { PushSubscriptionRecord } from "../domain/entities.js";

let configured = false;

export function hasPushConfiguration() {
  return Boolean(process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY);
}

export function pushPublicKey() {
  return env("PUSH_VAPID_PUBLIC_KEY");
}

function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.PUSH_CONTACT_EMAIL || "mailto:admin@vectraceemb.com", env("PUSH_VAPID_PUBLIC_KEY"), env("PUSH_VAPID_PRIVATE_KEY"));
  configured = true;
}

export async function sendBrowserPush(subscription: PushSubscriptionRecord, notification: { title: string; body: string }) {
  configure();
  return webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify({ ...notification, url: "/" }));
}
