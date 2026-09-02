import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./environment.js";

type StoredConnection = {
  id: string;
  email: string;
  refreshToken: string;
  connectedAt: string;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
};

const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const recordCollection = "gmail_connections";
const key = () => createHash("sha256").update(env("SUPABASE_SERVICE_ROLE_KEY")).digest();
const baseUrl = () => env("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = () => env("SUPABASE_SERVICE_ROLE_KEY");
const redirectUri = () => env("GOOGLE_GMAIL_REDIRECT_URI");

const encrypt = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
};

const decrypt = (value: string) => {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Saved Gmail connection is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
};

const decodeBase64Url = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const stripHtml = (value: string) => value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function findBody(payload: any): string {
  if (payload?.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload?.parts ?? []) {
    const body = findBody(part);
    if (body) return body;
  }
  if (payload?.mimeType === "text/html" && payload.body?.data) return stripHtml(decodeBase64Url(payload.body.data));
  return "";
}

function header(payload: any, name: string) {
  return String((payload?.headers ?? []).find((item: { name?: string }) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "");
}

export function hasGmailConfiguration() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_GMAIL_REDIRECT_URI);
}

export class GmailService {
  private readonly connectStates = new Map<string, { userId: string; expiresAt: number }>();

  private async records(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error("Could not save the Gmail connection");
    return response;
  }

  private async connection(userId: string): Promise<StoredConnection | undefined> {
    const query = new URLSearchParams({ collection: `eq.${recordCollection}`, id: `eq.${userId}`, select: "data", limit: "1" });
    const response = await this.records(`crm_records?${query}`);
    const rows = await response.json() as Array<{ data: StoredConnection }>;
    return rows[0]?.data;
  }

  private async accessToken(userId: string) {
    const connection = await this.connection(userId);
    if (!connection) throw Object.assign(new Error("Connect Gmail first"), { statusCode: 400 });
    const tokenResponse = await fetch(googleTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: decrypt(connection.refreshToken), grant_type: "refresh_token" }),
    });
    if (!tokenResponse.ok) throw Object.assign(new Error("Your Gmail connection expired. Connect Gmail again."), { statusCode: 401 });
    return (await tokenResponse.json() as { access_token: string }).access_token;
  }

  createConnectUrl(userId: string) {
    const state = randomBytes(32).toString("base64url");
    this.connectStates.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });
    const query = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      state,
    });
    return `${googleAuthorizeUrl}?${query}`;
  }

  async finishConnect(code: string, state: string) {
    const pending = this.connectStates.get(state);
    this.connectStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("Gmail connection expired. Please try again from the CRM.");
    const tokenResponse = await fetch(googleTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    });
    if (!tokenResponse.ok) throw new Error("Google could not complete the Gmail connection");
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string };
    if (!tokens.access_token || !tokens.refresh_token) throw new Error("Google did not provide a reusable Gmail connection. Please approve access again.");
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error("Could not read the connected Gmail account");
    const profile = await profileResponse.json() as { emailAddress?: string };
    const data: StoredConnection = { id: pending.userId, email: profile.emailAddress ?? "Connected Gmail", refreshToken: encrypt(tokens.refresh_token), connectedAt: new Date().toISOString() };
    await this.records("crm_records", { method: "POST", headers: { prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ collection: recordCollection, id: pending.userId, data }) });
    return data;
  }

  async status(userId: string) {
    const connection = await this.connection(userId);
    return { connected: Boolean(connection), email: connection?.email ?? null };
  }

  async matchingEmails(userId: string, contactEmail: string): Promise<GmailMessage[]> {
    const connection = await this.connection(userId);
    if (connection?.email.toLowerCase() === contactEmail.trim().toLowerCase())
      throw Object.assign(new Error("The POC email must be the client's email, not the connected Gmail account"), { statusCode: 400 });
    const accessToken = await this.accessToken(userId);
    // Keep Stage 3 focused: callers only need the three most recent messages
    // exchanged with this point of contact to select the first project email.
    const query = new URLSearchParams({ q: `{to:${contactEmail} from:${contactEmail}}`, maxResults: "3" });
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) throw Object.assign(new Error("Gmail could not load these messages. Reconnect Gmail and try again."), { statusCode: 400 });
    const list = await listResponse.json() as { messages?: Array<{ id: string; threadId: string }> };
    const messages = await Promise.all((list.messages ?? []).map(async (message) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return undefined;
      const item = await response.json() as { id: string; threadId: string; payload: unknown };
      const payload = item.payload as any;
      return { id: item.id, threadId: item.threadId, subject: header(payload, "subject") || "(No subject)", from: header(payload, "from"), to: header(payload, "to"), date: header(payload, "date"), body: findBody(payload).slice(0, 30000) };
    }));
    return messages.filter((message): message is GmailMessage => Boolean(message));
  }

  async sendProjectAssignment(userId: string, input: { to: string; designerName: string; projectName: string; projectType: string; clientCompany: string; assignedDate: string; payment: number; }) {
    if (!input.to.trim()) throw Object.assign(new Error("The designer needs an email address before this project can be sent."), { statusCode: 400 });
    const subject = `New Vectrace Emb project: ${input.projectName}`;
    const body = [`Hello ${input.designerName},`, "", "A new project has been assigned to you in Vectrace Emb CRM.", `Client: ${input.clientCompany}`, `Project: ${input.projectName}`, `Type: ${input.projectType}`, `Assigned date: ${input.assignedDate}`, `Designer payment: PKR ${input.payment.toLocaleString()}`, "", "Please sign in to Vectrace Emb CRM to review the brief and download the client files.", "", "Thank you,\nVectrace Emb"].join("\r\n");
    const raw = Buffer.from(`To: ${input.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`, "utf8").toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${await this.accessToken(userId)}`, "content-type": "application/json" }, body: JSON.stringify({ raw }) });
    if (!response.ok) throw Object.assign(new Error("The project was assigned, but Gmail could not send the email. Reconnect the Admin Gmail account and try again."), { statusCode: 400 });
    return { sent: true };
  }

}
