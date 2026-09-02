import type { Assignment, Client, Designer, Expense, Lead, Notification, PushSubscriptionRecord, SessionRecord, User } from "../domain/entities.js";
import type { Repository } from "./repository.js";

export interface LeadRepository extends Repository<Lead> {}
export interface ClientRepository extends Repository<Client> {}
export interface AssignmentRepository extends Repository<Assignment> {}
export interface DesignerRepository extends Repository<Designer> {}
export interface ExpenseRepository extends Repository<Expense> {}
export interface UserRepository extends Repository<User> {}
export interface NotificationRepository extends Repository<Notification> {}
export interface SessionRepository extends Repository<SessionRecord> {}
export interface PushSubscriptionRepository extends Repository<PushSubscriptionRecord> {}
