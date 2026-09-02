export type Role = "Admin" | "Caller" | "Designer";
export type LeadStatus = "Pending Approval" | "Data Added" | "Contacted" | "Follow-up Sent" | "Sample Provided" | "Closed - Won" | "Closed - Lost";
export type ProjectStatus = "Not Started" | "In Progress" | "Delivered";
export type ServiceType = "Digitizing" | "Embroidery" | "Vector Art" | "Custom Patches";
export type DateRangePreset = "All Time" | "This Month" | "This Year" | "Past 3 Months" | "Past 6 Months";
export const SERVICE_TYPES: ServiceType[] = ["Digitizing", "Embroidery", "Vector Art", "Custom Patches"];
export const LEAD_STATUSES_ADMIN: LeadStatus[] = ["Pending Approval", "Data Added", "Contacted", "Follow-up Sent", "Sample Provided", "Closed - Won", "Closed - Lost"];
export const LEAD_STATUSES_CALLER: Exclude<LeadStatus, "Pending Approval" | "Closed - Won">[] = ["Data Added", "Contacted", "Follow-up Sent", "Sample Provided", "Closed - Lost"];
export const DATE_RANGE_PRESETS: DateRangePreset[] = ["All Time", "This Month", "This Year", "Past 3 Months", "Past 6 Months"];

export interface User { id: string; name: string; email: string; role: Role; phone?: string; }
export interface POC { id: string; name: string; role: string; email: string; phone: string; }
export interface Order { projectName: string; amount: number; notes: string; date: string; }
export interface Opportunity { connected: boolean; emailSent?: boolean; createdAt: string; pocs: POC[]; trial: { given: boolean; date: string; logoName: string; projectType: string; notes: string; attachments?: string[]; rateType?: "Quoted" | "Paid"; projectName?: string; amount?: number; currency?: "USD" | "CAD" | "EUR"; startDate?: string }; orders: Order[]; }
export interface Call { date: string; duration: string; durationSeconds: number; notes: string; timestamp: number; }
export interface Followup { date: string; time: string; notes: string; }
export interface Lead { id: string; company: string; phone: string; website: string; social: string; contactName: string; contactRole: string; email: string; status: LeadStatus; hot: boolean; owner: string; capturedBy: string; assignedBy: string; assignedAt: string; isNew: boolean; createdAt: string; country: string; city: string; state?: string; address?: string; zipcode?: string; opportunity: Opportunity | null; calls: Call[]; followups: Followup[]; }
export interface Project { id: string; name: string; service: ServiceType; designer: string; status: ProjectStatus; startDate: string; attachments?: string[]; designerAttachments?: string[]; }
export interface Payment { date: string; amount: number; originalAmount?: number; currency?: "USD" | "CAD" | "EUR" | "PKR"; convertedPKR?: number; note?: string; }
export interface Client { id: string; company: string; contact: string; email: string; phone: string; type: "Paid" | "Unpaid"; createdAt: string; projects: Project[]; billingMonth: string; totalAmount: number; paid: number; payments: Payment[]; due: string; convertedFrom: string | null; convertedOn: string | null; }
export interface Delivery { name: string; path: string; uploadedAt: string; }
export interface Assignment { id: string; designerName: string; designerEmail: string; clientCompany: string; projectName: string; logoName: string; projectType: string; description: string; assignedDate: string; payment: number; paid: number; attachmentName: string | null; attachedFiles: string[]; emailSent: boolean; status?: ProjectStatus; deliveries?: Delivery[]; deliveryNote?: string; }
export interface Designer { id: string; name: string; email: string; address?: string; bankAccount?: string; phone?: string; }
export interface Expense { id: string; name: string; amount: number; date: string; category?: string; description?: string; currency?: "PKR" | "USD" | "CAD"; originalAmount?: number; convertedPKR?: number; }
export interface Notification { id: string; recipient: string; message: string; kind: "lead" | "followup" | "opportunity" | "project" | "payment"; createdAt: string; read: boolean; }
export interface SessionRecord { id: string; userId: string; name: string; email: string; role: Role; designerId?: string; expiresAt: string; }
export interface PushSubscriptionRecord { id: string; userId: string; endpoint: string; keys: { p256dh: string; auth: string }; createdAt: string; }
