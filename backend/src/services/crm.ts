import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import type { Assignment, Client, DateRangePreset, Expense, Lead, Notification, Opportunity, Payment, ProjectStatus, ServiceType, SessionRecord, User } from "../domain/entities.js";
import { DATE_RANGE_PRESETS } from "../domain/entities.js";
import type {
  AssignmentRepository,
  ClientRepository,
  DesignerRepository,
  ExpenseRepository,
  LeadRepository,
  UserRepository,
} from "../repositories/interfaces.js";
import type { Repository } from "../repositories/repository.js";

export interface Session {
  token: string;
  userId: string;
  name: string;
  email: string;
  role: "Admin" | "Caller" | "Designer";
  designerId?: string;
}
export interface Repositories {
  leads: LeadRepository;
  clients: ClientRepository;
  assignments: AssignmentRepository;
  designers: DesignerRepository;
  expenses: ExpenseRepository;
  users: UserRepository;
  notifications: import("../repositories/interfaces.js").NotificationRepository;
  sessions: import("../repositories/interfaces.js").SessionRepository;
  pushSubscriptions: import("../repositories/interfaces.js").PushSubscriptionRepository;
}
const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const sameProjectName = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
const uniqueFilePaths = (paths: string[]) => Array.from(new Map(paths.filter(Boolean).map((path) => [decodeURIComponent(path.split("/").pop() ?? path).toLocaleLowerCase(), path])).values());
export function inDateRange(
  dateStr: string | null | undefined,
  preset: DateRangePreset,
  today = new Date(),
): boolean {
  if (preset === "All Time" || !dateStr) return true;
  const date = new Date(dateStr);
  if (Number.isNaN(date.valueOf())) return true;
  if (preset === "This Month")
    return (
      date.getUTCFullYear() === today.getUTCFullYear() &&
      date.getUTCMonth() === today.getUTCMonth()
    );
  if (preset === "This Year")
    return date.getUTCFullYear() === today.getUTCFullYear();
  const months = preset === "Past 3 Months" ? 3 : 6;
  const start = new Date(today);
  start.setUTCMonth(start.getUTCMonth() - months);
  return date >= start && date <= today;
}
function inReportDateRange(date: string | null | undefined, preset: DateRangePreset, from?: string, to?: string) {
  if ((from || to) && date) {
    const value = new Date(date).valueOf();
    const start = from ? new Date(`${from}T00:00:00Z`).valueOf() : Number.NEGATIVE_INFINITY;
    const end = to ? new Date(`${to}T23:59:59Z`).valueOf() : Number.POSITIVE_INFINITY;
    return !Number.isNaN(value) && value >= start && value <= end;
  }
  return inDateRange(date, preset);
}
export function computeStage(opportunity: Opportunity | null): number {
  if (!opportunity) return 0;
  let stage = 1;
  if (opportunity.pocs.some((poc) => poc.name.trim() && poc.email.trim()))
    stage = 2;
  if (opportunity.emailSent) stage = Math.max(stage, 3);
  if (opportunity.trial.given) stage = Math.max(stage, 4);
  if (opportunity.orders.length || opportunity.trial.rateType === "Paid") stage = 5;
  return stage;
}
export function isCountedCall(seconds: number) {
  return seconds >= 30;
}

export class AuthService {
  private readonly sessions = new Map<string, Session>();
  private readonly sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
  private readonly credentials = new Map<
    string,
    {
      id: string;
      name: string;
      role: Session["role"];
      designerId?: string;
      hash: string;
    }
  >([
    [
      "ayesha@stitchcrm.com",
      {
        id: "usr-admin",
        name: "Ayesha Khan",
        role: "Admin",
        hash: bcrypt.hashSync("Admin123!", 10),
      },
    ],
    [
      "ahmed@stitchcrm.com",
      {
        id: "usr-caller-1",
        name: "Ahmed Farooqi",
        role: "Caller",
        hash: bcrypt.hashSync("Caller123!", 10),
      },
    ],
    [
      "mariam@stitchcrm.com",
      {
        id: "des-1",
        name: "Mariam Shah",
        role: "Designer",
        designerId: "des-1",
        hash: bcrypt.hashSync("Designer123!", 10),
      },
    ],
  ]);
  constructor(private readonly sessionStore?: Repository<SessionRecord>) {}
  private key(token: string) { return createHash("sha256").update(token).digest("hex"); }
  async restore() {
    if (!this.sessionStore) return;
    const records = await this.sessionStore.findAll();
    const nowMs = Date.now();
    await Promise.all(records.filter((record) => Date.parse(record.expiresAt) <= nowMs).map((record) => this.sessionStore!.delete(record.id)));
    for (const record of records) if (Date.parse(record.expiresAt) > nowMs)
      this.sessions.set(record.id, { token: record.id, userId: record.userId, name: record.name, email: record.email, role: record.role, designerId: record.designerId });
  }
  async login(email: string, password: string): Promise<Session | undefined> {
    const account = this.credentials.get(email.toLowerCase());
    if (!account || !(await bcrypt.compare(password, account.hash)))
      return undefined;
    return this.createSession({ ...account, email: email.toLowerCase() });
  }
  createSession(account: { id: string; name: string; email: string; role: Session["role"]; designerId?: string }): Session {
    const session: Session = { token: crypto.randomUUID(), userId: account.id, name: account.name, email: account.email.toLowerCase(), role: account.role, designerId: account.designerId };
    const key = this.key(session.token);
    this.sessions.set(key, session);
    const record: SessionRecord = { id: key, userId: session.userId, name: session.name, email: session.email, role: session.role, designerId: session.designerId, expiresAt: new Date(Date.now() + this.sessionLifetimeMs).toISOString() };
    void this.sessionStore?.create(record).catch(() => {});
    return session;
  }
  get(token?: string): Session | undefined {
    return token ? this.sessions.get(this.key(token)) : undefined;
  }
  logout(token?: string) {
    if (!token) return;
    const key = this.key(token);
    this.sessions.delete(key);
    void this.sessionStore?.delete(key).catch(() => {});
  }
  async createAccount(user: User, password: string, designerId?: string) { if (!password || password.length < 8) throw new Error("Password must be at least 8 characters"); if (this.credentials.has(user.email.toLowerCase())) throw new Error("Email already exists"); this.credentials.set(user.email.toLowerCase(), { id: user.id, name: user.name, role: user.role, designerId, hash: bcrypt.hashSync(password, 10) }); return user; }
}

export class CrmService {
  constructor(private readonly repos: Repositories, private readonly publish?: (notification: Notification) => void) {}
  private notify(recipient: string, message: string, kind: Notification["kind"]) {
    this.publish?.({ id: id("notification"), recipient, message, kind, createdAt: now(), read: false });
  }
  private async caller(callerId: string) {
    const user = await this.repos.users.findById(callerId);
    if (!user || user.role !== "Caller") throw new Error("Caller not found");
    return user;
  }
  private async convertIfWon(lead: Lead) {
    if (lead.status !== "Closed - Won") return;
    const clients = await this.repos.clients.findAll();
    if (clients.some((client) => client.convertedFrom === lead.id)) return;
    await this.repos.clients.create({
      id: id("client"),
      company: lead.company,
      contact: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      type: "Unpaid",
      createdAt: day(),
      projects: [
        {
          id: id("project"),
          name: "New Project — details pending",
          service: "Digitizing",
          designer: "Unassigned",
          status: "Not Started",
          startDate: day(),
        },
      ],
      billingMonth: "",
      totalAmount: 0,
      paid: 0,
      payments: [],
      due: "USD 0",
      convertedFrom: lead.id,
      convertedOn: day(),
    });
  }
  private async createClientAtStageFour(lead: Lead) {
    if (!lead.opportunity?.trial.given) return;
    const clients = await this.repos.clients.findAll();
    const trial = lead.opportunity.trial;
    const existingClient = clients.find((client) => client.convertedFrom === lead.id);
    if (existingClient) {
      const projectName = trial.projectName || "Free Trial Project";
      const projectIndex = existingClient.projects.findIndex(
        (project) => project.name === projectName || project.name === "Free Trial Project",
      );
      if (projectIndex < 0) return;
      const project = existingClient.projects[projectIndex];
      const attachments = uniqueFilePaths([...(project.attachments ?? []), ...(trial.attachments ?? [])]);
      if (attachments.length === (project.attachments ?? []).length) return;
      const projects = [...existingClient.projects];
      projects[projectIndex] = { ...project, attachments };
      await this.repos.clients.update(existingClient.id, { projects });
      return;
    }
    const usdRate = trial.currency === "CAD" ? 0.73 : trial.currency === "EUR" ? 1.09 : 1;
    const amount = (trial.amount ?? 0) * usdRate;
    await this.repos.clients.create({ id: id("client"), company: lead.company, contact: lead.contactName || "Not obtained yet", email: lead.email, phone: lead.phone, type: trial.rateType === "Paid" ? "Paid" : "Unpaid", createdAt: day(), projects: [{ id: id("project"), name: trial.projectName || "Free Trial Project", service: (trial.projectType || "Digitizing") as ServiceType, designer: "Unassigned", status: "Not Started", startDate: trial.startDate ?? day(), attachments: trial.attachments ?? [] }], billingMonth: "", totalAmount: amount, paid: 0, payments: [], due: `USD ${amount.toFixed(2)}`, convertedFrom: lead.id, convertedOn: day() });
  }
  private async assign(lead: Lead, caller: User, session: Session) {
    return {
      ...lead,
      owner: caller.name.split(" ")[0],
      assignedBy: session.name,
      assignedAt: now(),
      isNew: true,
    };
  }
  async listLeads(
    session: Session,
    filters: Record<string, string | undefined> = {},
  ) {
    let leads = await this.repos.leads.findAll();
    if (session.role === "Caller")
      leads = leads.filter(
        (lead) =>
          lead.owner === session.name.split(" ")[0] ||
          lead.capturedBy === session.name,
      );
    const range = filters.createdAtRange as DateRangePreset | undefined;
    if (range && DATE_RANGE_PRESETS.includes(range))
      leads = leads.filter((lead) => inDateRange(lead.createdAt, range));
    for (const key of [
      "owner",
      "capturedBy",
      "status",
      "hot",
      "isNew",
    ] as const)
      if (filters[key] !== undefined)
        leads = leads.filter((lead) => String(lead[key]) === filters[key]);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      leads = leads.filter((lead) =>
        [lead.company, lead.contactName, lead.owner].some((text) =>
          text.toLowerCase().includes(q),
        ),
      );
    }
    return leads.map((lead) => ({
      ...lead,
      stage: computeStage(lead.opportunity),
    }));
  }
  async createLead(
    session: Session,
    input: Pick<Lead, "company" | "phone"> & Partial<Lead>,
  ) {
    const leads = await this.repos.leads.findAll();
    const phone = (input.phone ?? "").replace(/\D/g, "");
    const company = (input.company ?? "").trim().toLowerCase();
    if (!company || !phone)
      throw Object.assign(new Error("Company name and phone number are required"), { statusCode: 400 });
    if (
      leads.some(
        (lead) =>
          lead.phone.replace(/\D/g, "") === phone ||
          lead.company.trim().toLowerCase() === company,
      )
    )
      throw new Error("Duplicate lead");
    const lead: Lead = {
      id: id("lead"),
      company: input.company,
      phone: input.phone,
      website: input.website ?? "",
      social: input.social ?? "",
      contactName: input.contactName ?? "",
      contactRole: input.contactRole ?? "",
      email: input.email ?? "",
      status: session.role === "Caller" ? "Pending Approval" : "Data Added",
      hot: false,
      owner: session.role === "Caller" ? session.name.split(" ")[0] : "You",
      capturedBy: session.name,
      assignedBy: "",
      assignedAt: now(),
      isNew: true,
      createdAt: day(),
      country: input.country ?? "",
      city: input.city ?? "",
      state: input.state ?? "",
      address: input.address ?? "",
      zipcode: input.zipcode ?? "",
      opportunity: null,
      calls: [],
      followups: [],
    };
    return this.repos.leads.create(lead);
  }
  async importLeads(
    session: Session,
    rows: Array<Pick<Lead, "company" | "phone"> & Partial<Lead>>,
  ) {
    let added = 0,
      skipped = 0;
    for (const row of rows) {
      if (!row.company?.trim() || !row.phone?.trim()) {
        skipped++;
        continue;
      }
      try {
        await this.createLead(session, row);
        added++;
      } catch {
        skipped++;
      }
    }
    return { added, skipped };
  }
  async updateLead(session: Session, leadId: string, patch: Partial<Lead>) {
    const existing = await this.repos.leads.findById(leadId);
    if (!existing) throw new Error("Lead not found");
    if (session.role === "Caller" && (patch.status === "Closed - Won" || patch.status === "Pending Approval")) throw new Error("Forbidden");
    if (session.role === "Caller" && patch.owner !== undefined) throw new Error("Forbidden");
    let next = { ...existing, ...patch };
    if (
      session.role === "Caller" &&
      existing.owner !== session.name.split(" ")[0] &&
      existing.capturedBy !== session.name
    )
      throw new Error("Forbidden");
    if (patch.owner && patch.owner !== existing.owner) {
      const callers = await this.repos.users.findAll();
      const caller = callers.find(
        (user) =>
          user.role === "Caller" && user.name.split(" ")[0] === patch.owner,
      );
      if (!caller) throw new Error("Caller not found");
      next = await this.assign(existing, caller, session);
      this.notify(caller.name, `A new lead was assigned to you: ${existing.company}.`, "lead");
    }
    if (next.opportunity?.trial.given) await this.createClientAtStageFour(next);
    if (patch.status === "Closed - Won") await this.convertIfWon(next);
    if (patch.opportunity) this.notify("Admin", `Opportunity stage updated for ${existing.company}.`, "opportunity");
    if (patch.followups && patch.followups.length > existing.followups.length) {
      const owner = (await this.repos.users.findAll()).find((user) => user.role === "Caller" && user.name.split(" ")[0] === existing.owner);
      if (owner) this.notify(owner.name, `A follow-up is scheduled for ${existing.company}.`, "followup");
    }
    return this.repos.leads.update(leadId, next);
  }
  async deleteLead(id: string) {
    return this.repos.leads.delete(id);
  }
  async markSeen(session: Session, leadId: string) {
    const lead = await this.repos.leads.findById(leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.owner === session.name.split(" ")[0])
      return this.repos.leads.update(leadId, { isNew: false });
    return lead;
  }
  async logCall(
    session: Session,
    leadId: string,
    durationSeconds: number,
    notes: string,
  ) {
    if (session.role === "Designer") throw new Error("Forbidden");
    if (durationSeconds <= 0)
      throw new Error("Call duration must be greater than zero");
    const lead = await this.repos.leads.findById(leadId);
    if (!lead) throw new Error("Lead not found");
    if (
      session.role === "Caller" &&
      lead.owner !== session.name.split(" ")[0] &&
      lead.capturedBy !== session.name
    )
      throw new Error("Forbidden");
    const mins = Math.floor(durationSeconds / 60),
      secs = durationSeconds % 60;
    const opportunity = lead.opportunity ?? {
      connected: false,
      createdAt: day(),
      pocs: [],
      trial: {
        given: false,
        date: "",
        logoName: "",
        projectType: "",
        notes: "",
      },
      orders: [],
    };
    const call = {
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      duration: `${mins}m ${secs}s`,
      durationSeconds,
      notes,
      timestamp: Date.now(),
    };
    return this.repos.leads.update(leadId, {
      calls: [...lead.calls, call],
      opportunity,
      hot: true,
    });
  }
  async bulkAssign(session: Session, leadIds: string[], callerId: string) {
    const caller = await this.caller(callerId);
    const updated = [];
    for (const leadId of leadIds) {
      const lead = await this.repos.leads.findById(leadId);
      if (lead)
        updated.push(
          await this.repos.leads.update(
            leadId,
            await this.assign(lead, caller, session),
          ),
        );
    }
    const assigned = updated.filter(Boolean);
    if (assigned.length) this.notify(caller.name, `${assigned.length} lead${assigned.length === 1 ? " was" : "s were"} assigned to you.`, "lead");
    return assigned;
  }
  async listOpportunities(
    session: Session,
    filters: Record<string, string | undefined>,
  ) {
    const leads = await this.listLeads(session, filters);
    return leads
      .filter((lead) => lead.opportunity)
      .filter((lead) => !filters.stage || String(lead.stage) === filters.stage)
      .filter(
        (lead) =>
          !filters.createdAtRange ||
          inDateRange(
            lead.opportunity!.createdAt,
            filters.createdAtRange as DateRangePreset,
          ),
      );
  }
  async addOrder(
    session: Session,
    leadId: string,
    order: { projectName: string; amount: number; notes: string },
  ) {
    const lead = await this.repos.leads.findById(leadId);
    if (!lead?.opportunity) throw new Error("Opportunity not found");
    if (session.role === "Caller" && lead.owner !== session.name.split(" ")[0] && lead.capturedBy !== session.name) throw new Error("Forbidden");
    const opportunity = {
      ...lead.opportunity,
      orders: [...lead.opportunity.orders, { ...order, date: day() }],
    };
    const updated = await this.repos.leads.update(leadId, {
      opportunity,
      status: "Closed - Won",
    });
    if (updated) await this.convertIfWon(updated);
    return updated;
  }
  async listClients(range?: DateRangePreset) {
    // Backfill any opportunities that reached Stage 4 before the client-link
    // rule was introduced. createClientAtStageFour is idempotent, so this never
    // duplicates an existing client.
    const leads = await this.repos.leads.findAll();
    for (const lead of leads)
      if (lead.opportunity?.trial.given)
        await this.createClientAtStageFour(lead);
    const clients = await this.repos.clients.findAll();
    return range ? clients.filter((client) => inDateRange(client.createdAt, range)) : clients;
  }
  async createClient(input: Partial<Client>) {
    if (!input.company?.trim() || !input.contact?.trim()) throw new Error("Company and contact are required");
    return this.repos.clients.create({ id: id("client"), company: input.company.trim(), contact: input.contact.trim(), email: input.email ?? "", phone: input.phone ?? "", type: input.type ?? "Unpaid", createdAt: day(), projects: input.projects ?? [], billingMonth: input.billingMonth ?? "", totalAmount: input.totalAmount ?? 0, paid: 0, payments: [], due: input.due ?? "USD 0", convertedFrom: null, convertedOn: null });
  }
  async updateClient(clientId: string, patch: Partial<Client>) { return this.repos.clients.update(clientId, patch); }
  async addClientOrder(clientId: string, order: { projectName: string; amount: number; service?: ServiceType; startDate?: string; attachments?: string[]; type?: Client["type"] }) { const client = await this.repos.clients.findById(clientId); if (!client || !order.projectName || order.amount <= 0) throw new Error("Invalid client order"); return this.repos.clients.update(clientId, { type: order.type ?? client.type, totalAmount: client.totalAmount + order.amount, projects: [...client.projects, { id: id("project"), name: order.projectName, service: order.service ?? "Digitizing", designer: "Unassigned", status: "Not Started", startDate: order.startDate ?? day(), attachments: order.attachments ?? [] }] }); }
  async addPayment(clientId: string, amount: number, date = day(), metadata: Partial<Payment> = {}) {
    const client = await this.repos.clients.findById(clientId);
    if (!client || amount <= 0) throw new Error("Invalid client payment");
    const updated = await this.repos.clients.update(clientId, {
      payments: [...client.payments, { date, amount, originalAmount: metadata.originalAmount ?? amount, currency: metadata.currency ?? "USD", convertedPKR: metadata.convertedPKR, note: metadata.note }],
      paid: client.paid + amount,
      type: client.paid + amount >= client.totalAmount ? "Paid" : "Unpaid",
    });
    this.notify("Admin", `Client payment received from ${client.company}: USD ${amount.toFixed(2)}.`, "payment");
    return updated;
  }
  async listAssignments(session: Session, range?: DateRangePreset) {
    let rows = await this.repos.assignments.findAll();
    if (session.role === "Designer") {
      const designer = session.designerId ? await this.repos.designers.findById(session.designerId) : undefined;
      if (!designer) throw new Error("Designer identity not found");
      rows = rows.filter((row) => row.designerEmail === designer.email || row.designerName === designer.name);
      const safeRows = rows.map((row) => {
        const { clientCompany: _company, designerEmail: _email, ...safe } = row;
        return { ...safe, status: row.status ?? "Not Started" };
      });
      return range
        ? safeRows.filter((row) => inDateRange(row.assignedDate, range))
        : safeRows;
    }
    return range
      ? rows.filter((row) => inDateRange(row.assignedDate, range))
      : rows;
  }
  async createAssignment(input: Partial<Assignment>) {
    if (!input.designerName || !input.projectName || !input.payment || input.payment <= 0) throw new Error("Designer, project, and PKR payment are required");
    const assignment = await this.repos.assignments.create({ id: id("assignment"), designerName: input.designerName, designerEmail: input.designerEmail ?? "", clientCompany: input.clientCompany ?? "—", projectName: input.projectName, logoName: input.logoName ?? "", projectType: input.projectType ?? "Digitizing", description: input.description ?? "", assignedDate: input.assignedDate ?? day(), payment: input.payment, paid: 0, attachmentName: input.attachmentName ?? null, attachedFiles: input.attachedFiles ?? [], emailSent: false, status: "Not Started" });
    const clients = await this.repos.clients.findAll();
    const client = clients.find((item) => item.company === assignment.clientCompany);
    if (client) {
      const exists = client.projects.some((project) => sameProjectName(project.name, assignment.projectName));
      await this.repos.clients.update(client.id, { projects: exists ? client.projects.map((project) => sameProjectName(project.name, assignment.projectName) ? { ...project, designer: assignment.designerName, status: "Not Started", attachments: uniqueFilePaths([...(project.attachments ?? []), ...assignment.attachedFiles]) } : project) : [...client.projects, { id: id("project"), name: assignment.projectName, service: assignment.projectType as ServiceType, designer: assignment.designerName, status: "Not Started", startDate: assignment.assignedDate, attachments: uniqueFilePaths(assignment.attachedFiles) }] });
    }
    this.notify(assignment.designerName, `New project assigned: ${assignment.projectName}.`, "project");
    return assignment;
  }
  async addManualPayment(input: Partial<Assignment>) { return this.createAssignment({ ...input, clientCompany: "—", projectName: "Manual payment", projectType: "—" }); }
  async addDesignerPayment(input: { designerName?: string; amount?: number; date?: string; note?: string }) {
    if (!input.designerName?.trim() || !input.amount || input.amount <= 0) throw new Error("Designer and PKR amount are required");
    return this.repos.assignments.create({ id: id("assignment"), designerName: input.designerName.trim(), designerEmail: "", clientCompany: "—", projectName: "Manual designer payment", logoName: "—", projectType: "—", description: input.note ?? "", assignedDate: input.date ?? day(), payment: input.amount, paid: input.amount, attachmentName: null, attachedFiles: [], emailSent: false });
  }
  async markAssignmentPaid(id: string) {
    const assignment = await this.repos.assignments.findById(id);
    if (!assignment) throw new Error("Assignment not found");
    return this.repos.assignments.update(id, { paid: assignment.payment });
  }
  async updateAssignmentStatus(
    session: Session,
    assignmentId: string,
    status: ProjectStatus,
  ) {
    if (session.role !== "Designer") throw new Error("Forbidden");
    const assignment = await this.repos.assignments.findById(assignmentId);
    if (!assignment || (assignment.designerEmail.toLowerCase() !== session.email && assignment.designerName !== session.name))
      throw new Error("Forbidden");
    const allowed: ProjectStatus[] = [
      "Not Started",
      "In Progress",
      "Delivered",
    ];
    if (!allowed.includes(status)) throw new Error("Invalid project status");
    const updatedAssignment = await this.repos.assignments.update(assignmentId, { status });
    const clients = await this.repos.clients.findAll();
    const client = clients.find(
      (item) => item.company === assignment.clientCompany,
    );
    if (client)
      await this.repos.clients.update(client.id, {
        projects: client.projects.map((project) =>
          sameProjectName(project.name, assignment.projectName)
            ? { ...project, status }
            : project,
        ),
      });
    return updatedAssignment;
  }
  async submitAssignmentDelivery(session: Session, assignmentId: string, deliveries: Assignment["deliveries"], note?: string) {
    if (session.role !== "Designer") throw new Error("Forbidden");
    const assignment = await this.repos.assignments.findById(assignmentId);
    if (!assignment || (assignment.designerEmail ? assignment.designerEmail.toLowerCase() !== session.email.toLowerCase() : assignment.designerName !== session.name)) throw new Error("Forbidden");
    if (!deliveries?.length) throw new Error("Add at least one final file");
    const allDeliveries = [...(assignment.deliveries ?? []), ...deliveries];
    if (allDeliveries.length > 6) throw new Error("A project can have up to 6 final files");
    await this.updateAssignmentStatus(session, assignmentId, "Delivered");
    const updated = await this.repos.assignments.update(assignmentId, { deliveries: allDeliveries, deliveryNote: note?.trim() ?? assignment.deliveryNote ?? "" });
    const clients = await this.repos.clients.findAll();
    const client = clients.find((item) => item.company === assignment.clientCompany);
    if (client) await this.repos.clients.update(client.id, { projects: client.projects.map((project) => sameProjectName(project.name, assignment.projectName) ? { ...project, designerAttachments: uniqueFilePaths([...(project.designerAttachments ?? []), ...deliveries.map((file) => file.path)]) } : project) });
    this.notify("Admin", `${assignment.designerName} delivered ${deliveries.length} file${deliveries.length === 1 ? "" : "s"} for ${assignment.projectName}.`, "project");
    return updated;
  }
  async removeAssignmentDelivery(session: Session, assignmentId: string, filePath: string) {
    if (session.role !== "Designer") throw new Error("Forbidden");
    const assignment = await this.repos.assignments.findById(assignmentId);
    if (!assignment || (assignment.designerEmail ? assignment.designerEmail.toLowerCase() !== session.email.toLowerCase() : assignment.designerName !== session.name)) throw new Error("Forbidden");
    const deliveries = (assignment.deliveries ?? []).filter((file) => file.path !== filePath);
    if (deliveries.length === (assignment.deliveries ?? []).length) throw new Error("File not found");
    const updated = await this.repos.assignments.update(assignmentId, { deliveries });
    const clients = await this.repos.clients.findAll();
    const client = clients.find((item) => item.company === assignment.clientCompany);
    if (client) await this.repos.clients.update(client.id, { projects: client.projects.map((project) => sameProjectName(project.name, assignment.projectName) ? { ...project, designerAttachments: (project.designerAttachments ?? []).filter((path) => path !== filePath) } : project) });
    return updated;
  }
  async financeSummary(range: DateRangePreset, customRate?: number, from?: string, to?: string) {
    const [clients, assignments, expenses] = await Promise.all([
      this.repos.clients.findAll(),
      this.repos.assignments.findAll(),
      this.repos.expenses.findAll(),
    ]);
    const incomeUSD = clients
      .flatMap((client) => client.payments)
      .filter((payment) => inReportDateRange(payment.date, range, from, to))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const expensesInRange = expenses.filter((expense) => inReportDateRange(expense.date, range, from, to));
    const otherExpensesPKR = expensesInRange
      .filter((expense) => expense.category !== "Designer Payment")
      .reduce((sum, expense) => sum + expense.amount, 0);
    const historicalDesignerPaymentsPKR = expensesInRange
      .filter((expense) => expense.category === "Designer Payment")
      .reduce((sum, expense) => sum + expense.amount, 0);
    const designerPaymentsPKR = historicalDesignerPaymentsPKR + assignments
      .filter((assignment) => inReportDateRange(assignment.assignedDate, range, from, to))
      .reduce((sum, assignment) => sum + assignment.paid, 0);
    // The finance dashboard treats every outgoing payment as an expense. Keep the
    // designer subtotal as well so it can still be reviewed separately.
    const expensesPKR = otherExpensesPKR + designerPaymentsPKR;
    const rate = customRate && customRate > 0 ? customRate : 278;
    return {
      incomeUSD,
      incomePKR: incomeUSD * rate,
      expensesPKR,
      otherExpensesPKR,
      netProfitPKR: incomeUSD * rate - expensesPKR,
      designerPaymentsPKR,
      exchangeRate: rate,
    };
  }
  async listExpenses() { return this.repos.expenses.findAll(); }
  async createExpense(input: Partial<Expense>) { if (!input.name?.trim() || !input.amount || input.amount <= 0) throw new Error("Expense name and PKR amount are required"); return this.repos.expenses.create({ id: id("expense"), name: input.name.trim(), amount: input.amount, date: input.date ?? day(), category: input.category ?? "General", description: input.description ?? "", currency: input.currency ?? "PKR", originalAmount: input.originalAmount ?? input.amount, convertedPKR: input.convertedPKR ?? input.amount }); }
}
