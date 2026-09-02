import type { Assignment, Client, Designer, Expense, Lead, Notification, PushSubscriptionRecord, SessionRecord, User } from "../domain/entities.js";
import { env } from "../infrastructure/environment.js";
import type { AssignmentRepository, ClientRepository, DesignerRepository, ExpenseRepository, LeadRepository, UserRepository } from "./interfaces.js";
import type { Repository } from "./repository.js";

type StoredRow<T> = { collection: string; id: string; data: T };

class SupabaseRepository<T extends { id: string }> implements Repository<T> {
  constructor(private readonly collection: string) {}

  private async request(path: string, init: RequestInit = {}) {
    const baseUrl = env("SUPABASE_URL").replace(/\/$/, "");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
    return response;
  }

  async findAll(): Promise<T[]> {
    const query = new URLSearchParams({ collection: `eq.${this.collection}`, select: "data", order: "updated_at.asc" });
    const rows = await (await this.request(`crm_records?${query.toString()}`)).json() as Array<Pick<StoredRow<T>, "data">>;
    return rows.map((row) => row.data);
  }

  async findById(id: string): Promise<T | undefined> {
    const query = new URLSearchParams({ collection: `eq.${this.collection}`, id: `eq.${id}`, select: "data", limit: "1" });
    const rows = await (await this.request(`crm_records?${query.toString()}`)).json() as Array<Pick<StoredRow<T>, "data">>;
    return rows[0]?.data;
  }

  async create(data: T): Promise<T> {
    await this.request("crm_records", { method: "POST", body: JSON.stringify({ collection: this.collection, id: data.id, data }) });
    return structuredClone(data);
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;
    const updated = { ...current, ...structuredClone(patch) };
    const query = new URLSearchParams({ collection: `eq.${this.collection}`, id: `eq.${id}` });
    await this.request(`crm_records?${query.toString()}`, { method: "PATCH", body: JSON.stringify({ data: updated }) });
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const query = new URLSearchParams({ collection: `eq.${this.collection}`, id: `eq.${id}` });
    const response = await this.request(`crm_records?${query.toString()}`, { method: "DELETE", headers: { prefer: "return=representation" } });
    const rows = await response.json() as StoredRow<T>[];
    return rows.length > 0;
  }
}

export interface SupabaseRepositories {
  leads: LeadRepository;
  clients: ClientRepository;
  assignments: AssignmentRepository;
  designers: DesignerRepository;
  expenses: ExpenseRepository;
  users: UserRepository;
  notifications: import("./interfaces.js").NotificationRepository;
  sessions: import("./interfaces.js").SessionRepository;
  pushSubscriptions: import("./interfaces.js").PushSubscriptionRepository;
}

export function createSupabaseRepositories(): SupabaseRepositories {
  return {
    leads: new SupabaseRepository<Lead>("leads"),
    clients: new SupabaseRepository<Client>("clients"),
    assignments: new SupabaseRepository<Assignment>("assignments"),
    designers: new SupabaseRepository<Designer>("designers"),
    expenses: new SupabaseRepository<Expense>("expenses"),
    users: new SupabaseRepository<User>("users"),
    notifications: new SupabaseRepository<Notification>("notifications"),
    sessions: new SupabaseRepository<SessionRecord>("sessions"),
    pushSubscriptions: new SupabaseRepository<PushSubscriptionRecord>("push_subscriptions"),
  };
}
