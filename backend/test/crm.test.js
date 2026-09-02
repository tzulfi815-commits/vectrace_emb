import { describe, expect, it } from "vitest";
import { computeStage, CrmService, inDateRange, isCountedCall } from "../src/services/crm.js";
import { createSeededRepositories } from "../src/repositories/seed.js";
const admin = { token: "test", userId: "usr-admin", name: "Ayesha Khan", role: "Admin" };
const caller = { token: "test", userId: "usr-caller-1", name: "Hamza Ali", role: "Caller" };
const service = () => new CrmService(createSeededRepositories());
describe("StitchCRM business rules", () => {
    it("computes stages without storing stage", () => { expect(computeStage(null)).toBe(0); expect(computeStage({ connected: true, createdAt: "2026-01-01", pocs: [{ id: "1", name: "A", role: "", email: "a@test.com", phone: "" }], trial: { given: true, date: "", logoName: "", projectType: "", notes: "" }, orders: [{ projectName: "Order", amount: 1, notes: "", date: "" }] })).toBe(5); });
    it("creates an opportunity on the first call", async () => { const crm = service(); const lead = await crm.logCall(caller, "lead-1", 40, "Reached reception"); expect(lead?.opportunity).not.toBeNull(); expect(lead?.hot).toBe(true); });
    it("converts a won lead once", async () => { const crm = service(); await crm.updateLead(admin, "lead-1", { status: "Closed - Won" }); const clients = await crm.listClients(); expect(clients.filter((client) => client.convertedFrom === "lead-1")).toHaveLength(1); });
    it("uses the same side effects for bulk and single assignment", async () => { const crm = service(); const bulk = await crm.bulkAssign(admin, ["lead-1"], "usr-caller-1"); const single = await crm.updateLead(admin, "lead-4", { owner: "Ahmed" }); expect(bulk[0]).toMatchObject({ owner: "Ahmed", assignedBy: "Ayesha Khan", isNew: true }); expect(single).toMatchObject({ owner: "Ahmed", assignedBy: "Ayesha Khan", isNew: true }); });
    it("keeps missing and invalid dates in filtered results", () => { expect(inDateRange("", "This Month")).toBe(true); expect(inDateRange("not-a-date", "Past 3 Months")).toBe(true); expect(inDateRange("2026-08-10", "This Month", new Date("2026-08-17"))).toBe(true); });
    it("detects duplicate phone or company leads", async () => { const crm = service(); await expect(crm.createLead(admin, { company: "Another", phone: "+1 206 555 0188" })).rejects.toThrow("Duplicate"); await expect(crm.createLead(admin, { company: " atlas uniforms ", phone: "999" })).rejects.toThrow("Duplicate"); });
    it("counts only calls of thirty seconds or longer", () => { expect(isCountedCall(29)).toBe(false); expect(isCountedCall(30)).toBe(true); });
});
