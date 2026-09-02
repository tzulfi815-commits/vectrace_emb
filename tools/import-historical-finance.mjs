import fs from "node:fs";
import crypto from "node:crypto";

const [clientsFile, financeFile, vendorFile] = process.argv.slice(2);
if (!clientsFile || !financeFile || !vendorFile) throw new Error("Usage: node tools/import-historical-finance.mjs <clients.csv> <finances.csv> <vendor-finance.csv>");

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#")).map((line) => { const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; }));
const base = env.SUPABASE_URL.replace(/\/$/, "");
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", prefer: "resolution=merge-duplicates" };
const parse = (text) => { const rows = []; let row = [], cell = "", quote = false; for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (char === '"') { if (quote && text[i + 1] === '"') { cell += '"'; i += 1; } else quote = !quote; } else if (char === "," && !quote) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quote) { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows; };
const slug = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const recordId = (prefix, value) => `${prefix}-${crypto.createHash("sha1").update(value).digest("hex").slice(0, 20)}`;
const amount = (value) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const date = (value) => { const parts = String(value ?? "").trim().split(/[/-]/).map(Number); if (parts.length !== 3 || parts.some(Number.isNaN)) return ""; let [first, second, year] = parts; let day = first, month = second; if (second > 12) [month, day] = [first, second]; return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; };
const csv = (file, headerRow = 0) => { const rows = parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); const headers = rows[headerRow]; return rows.slice(headerRow + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))); };
const getRecords = async (collection) => { const response = await fetch(`${base}/rest/v1/crm_records?collection=eq.${encodeURIComponent(collection)}&select=id,data` , { headers }); if (!response.ok) throw new Error(`Could not read ${collection}: ${response.status}`); return response.json(); };
const save = async (collection, id, data) => { const response = await fetch(`${base}/rest/v1/crm_records?on_conflict=collection,id`, { method: "POST", headers, body: JSON.stringify({ collection, id, data }) }); if (!response.ok) throw new Error(`Could not save ${collection}: ${response.status}`); };

const clientRows = csv(clientsFile).filter((row) => row.Client && !/^(may|june|july|august)$/i.test(row.Client));
const financeRows = csv(financeFile);
const vendorRows = csv(vendorFile, 1).filter((row) => /^\d+$/.test(row["S.NO"] ?? ""));
const existingClients = await getRecords("clients");
const byContact = new Map(existingClients.map((row) => [slug(row.data.contact), row]));
const importedClients = new Map();
for (const row of clientRows) {
  const contact = row.Client.trim(); const key = slug(contact); if (!key || importedClients.has(key)) continue;
  const existing = byContact.get(key);
  importedClients.set(key, existing?.data ?? { id: recordId("historical-client", key), company: row.Company?.trim() || contact, contact, email: row.Email?.trim() || "", phone: row.Contact?.trim() || "", type: "Paid", createdAt: "2026-05-01", projects: [], billingMonth: "", totalAmount: 0, paid: 0, payments: [], due: "USD 0", convertedFrom: null, convertedOn: null });
}
const brian = { id: recordId("historical-client", "brian"), company: "The fresh prints", contact: "brian", email: "brightprince354@gmail.com", phone: "(617) 803-9061", type: "Paid", createdAt: "2026-06-01", projects: [], billingMonth: "", totalAmount: 0, paid: 0, payments: [], due: "USD 0", convertedFrom: null, convertedOn: null };
if (!importedClients.has("brian")) importedClients.set("brian", byContact.get("brian")?.data ?? brian);
const aliases = new Map([["riley", "rileymcmonigle"], ["sherazxpari", "sheraz"]]);
let clientPayments = 0;
for (const [index, row] of financeRows.entries()) {
  if (row.Type !== "Client payment") continue;
  const match = row.Description?.match(/\((.+?)\)/); if (!match) continue;
  const paymentAmount = amount(row.Payments); const paymentDate = date(row.Date); if (!paymentAmount || !paymentDate) continue;
  const sourceName = slug(match[1]); const key = aliases.get(sourceName) ?? sourceName; const client = importedClients.get(key); if (!client) throw new Error(`No client match for payment: ${match[1]}`);
  const note = `Historical finance import #${index + 1}: ${row.Description}`;
  if (!(client.payments ?? []).some((payment) => payment.note === note)) { client.payments = [...(client.payments ?? []), { date: paymentDate, amount: paymentAmount, originalAmount: paymentAmount, currency: "USD", note }]; clientPayments += 1; }
}
for (const client of importedClients.values()) { const total = (client.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0); client.totalAmount = total; client.paid = total; client.type = "Paid"; client.due = "USD 0"; await save("clients", client.id, client); }

let expenses = 0;
for (const [index, row] of financeRows.entries()) {
  const flow = row["Expense / Income"]; const category = row.Type; const isGeneralDesignerTotal = category === "Designer payments" && /^All the payments/i.test(row.Description ?? "");
  if (!(["Investment", "Expense"].includes(flow)) || (category === "Designer payments" && !isGeneralDesignerTotal)) continue;
  const value = amount(row.Payments); const when = date(row.Date); if (!value || !when) continue;
  const id = recordId("historical-expense", `${index}-${row.Description}`); await save("expenses", id, { id, name: row.Description.trim(), amount: value, date: when, category: "General Expense", description: `Historical ${flow.toLowerCase()} import`, currency: "PKR", originalAmount: value, convertedPKR: value }); expenses += 1;
}
let vendorPayments = 0;
for (const [index, row] of vendorRows.entries()) { const value = amount(row.payments); const when = date(row.Date); if (!value || !when) continue; const vendor = row["Vendor name"]?.trim(); if (!vendor) continue; const id = recordId("historical-designer-payment", `${index}-${row["S.NO"]}-${vendor}`); await save("expenses", id, { id, name: vendor, amount: value, date: when, category: "Designer Payment", description: `Historical vendor payment — ${row["Clinet Name"]?.trim() || "Client"}: ${row["Logo Name"]?.trim() || "Work"}`, currency: "PKR", originalAmount: value, convertedPKR: value }); vendorPayments += 1; }
console.log(JSON.stringify({ clients: importedClients.size, clientPayments, generalExpenses: expenses, designerPayments: vendorPayments }, null, 2));
