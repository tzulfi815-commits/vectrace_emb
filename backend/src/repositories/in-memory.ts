import type { Assignment, Client, Designer, Expense, Lead, Notification, PushSubscriptionRecord, SessionRecord, User } from "../domain/entities.js";
import type { AssignmentRepository, ClientRepository, DesignerRepository, ExpenseRepository, LeadRepository, NotificationRepository, PushSubscriptionRepository, SessionRepository, UserRepository } from "./interfaces.js";
import type { Repository } from "./repository.js";

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  constructor(protected readonly records: T[]) {}
  async findAll(): Promise<T[]> { return structuredClone(this.records); }
  async findById(id: string): Promise<T | undefined> { const item = this.records.find((record) => record.id === id); return item && structuredClone(item); }
  async create(data: T): Promise<T> { if (this.records.some((record) => record.id === data.id)) throw new Error(`Duplicate id: ${data.id}`); this.records.push(structuredClone(data)); return structuredClone(data); }
  async update(id: string, patch: Partial<T>): Promise<T | undefined> { const index = this.records.findIndex((record) => record.id === id); if (index < 0) return undefined; this.records[index] = { ...this.records[index], ...structuredClone(patch) }; return structuredClone(this.records[index]); }
  async delete(id: string): Promise<boolean> { const index = this.records.findIndex((record) => record.id === id); if (index < 0) return false; this.records.splice(index, 1); return true; }
}
export class InMemoryLeadRepository extends InMemoryRepository<Lead> implements LeadRepository {}
export class InMemoryClientRepository extends InMemoryRepository<Client> implements ClientRepository {}
export class InMemoryAssignmentRepository extends InMemoryRepository<Assignment> implements AssignmentRepository {}
export class InMemoryDesignerRepository extends InMemoryRepository<Designer> implements DesignerRepository {}
export class InMemoryExpenseRepository extends InMemoryRepository<Expense> implements ExpenseRepository {}
export class InMemoryUserRepository extends InMemoryRepository<User> implements UserRepository {}
export class InMemoryNotificationRepository extends InMemoryRepository<Notification> implements NotificationRepository {}
export class InMemorySessionRepository extends InMemoryRepository<SessionRecord> implements SessionRepository {}
export class InMemoryPushSubscriptionRepository extends InMemoryRepository<PushSubscriptionRecord> implements PushSubscriptionRepository {}
