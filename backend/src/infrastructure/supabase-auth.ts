import { env } from "./environment.js";
import type { Session } from "../services/crm.js";

type AuthUser = { id: string; email?: string };
type TokenResponse = { access_token: string; user: AuthUser };
type Profile = { id: string; full_name: string; role: Session["role"]; designer_id?: string | null };

const baseUrl = () => env("SUPABASE_URL").replace(/\/$/, "");
const publishableKey = () => env("SUPABASE_PUBLISHABLE_KEY");
const serviceKey = () => env("SUPABASE_SERVICE_ROLE_KEY");

async function responseJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ message?: string; error_description?: string }>;
}

export class SupabaseAuth {
  private async profile(userId: string): Promise<Profile | undefined> {
    const query = new URLSearchParams({ id: `eq.${userId}`, select: "id,full_name,role,designer_id", limit: "1" });
    const response = await fetch(`${baseUrl()}/rest/v1/crm_profiles?${query}`, {
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
    });
    if (!response.ok) throw new Error("Unable to load this user's CRM role");
    return (await response.json() as Profile[])[0];
  }

  async login(email: string, password: string): Promise<Omit<Session, "token">> {
    const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey(), "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await responseJson(response);
      throw Object.assign(new Error(error.error_description ?? error.message ?? "Invalid email or password"), { statusCode: 401 });
    }
    const result = await response.json() as TokenResponse;
    const profile = await this.profile(result.user.id);
    if (!profile) throw Object.assign(new Error("Your CRM role has not been assigned yet"), { statusCode: 403 });
    return { userId: result.user.id, name: profile.full_name, email: result.user.email ?? email.toLowerCase(), role: profile.role, designerId: profile.designer_id ?? undefined };
  }

  async setInvitePassword(accessToken: string, password: string) {
    if (password.length < 8) throw Object.assign(new Error("Password must be at least 8 characters"), { statusCode: 400 });
    const response = await fetch(`${baseUrl()}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: publishableKey(), authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const error = await responseJson(response);
      throw Object.assign(new Error(error.error_description ?? error.message ?? "Invitation link is invalid or expired"), { statusCode: 400 });
    }
    return { ok: true };
  }

  async inviteUser(input: { name: string; email: string; role: Session["role"]; designerId?: string }) {
    const response = await fetch(`${baseUrl()}/auth/v1/invite`, {
      method: "POST",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json" },
      body: JSON.stringify({ email: input.email.toLowerCase(), data: { full_name: input.name } }),
    });
    if (!response.ok) {
      const error = await responseJson(response);
      throw Object.assign(new Error(error.error_description ?? error.message ?? "Could not send the invitation"), { statusCode: 400 });
    }
    const authUser = await response.json() as { id: string; email?: string };
    const profileResponse = await fetch(`${baseUrl()}/rest/v1/crm_profiles?on_conflict=id`, {
      method: "POST",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: authUser.id, full_name: input.name, role: input.role, designer_id: input.designerId ?? null }),
    });
    if (!profileResponse.ok) throw new Error("Account was created, but its CRM role could not be saved");
    return { id: authUser.id, email: authUser.email ?? input.email.toLowerCase() };
  }

  async assignRole(input: { id: string; name: string; role: Session["role"]; designerId?: string }) {
    const response = await fetch(`${baseUrl()}/rest/v1/crm_profiles?on_conflict=id`, {
      method: "POST",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: input.id, full_name: input.name, role: input.role, designer_id: input.designerId ?? null }),
    });
    if (!response.ok) throw new Error("Could not save this user's CRM role");
    return { ok: true };
  }

  async updateName(userId: string, name: string) {
    const profile = await this.profile(userId);
    if (!profile) throw Object.assign(new Error("Assign a CRM role before editing this user"), { statusCode: 400 });
    const response = await fetch(`${baseUrl()}/rest/v1/crm_profiles?on_conflict=id`, {
      method: "POST",
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json", prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: userId, full_name: name, role: profile.role, designer_id: profile.designer_id ?? null }),
    });
    if (!response.ok) throw new Error("Could not update this user's name");
    return profile;
  }

  async removeDesignerAccount(designerId: string) {
    const query = new URLSearchParams({ designer_id: `eq.${designerId}`, select: "id" });
    const profileResponse = await fetch(`${baseUrl()}/rest/v1/crm_profiles?${query}`, {
      headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
    });
    if (!profileResponse.ok) throw new Error("Could not find this designer's CRM account");
    const profiles = await profileResponse.json() as Array<{ id: string }>;
    for (const profile of profiles) {
      const response = await fetch(`${baseUrl()}/auth/v1/admin/users/${profile.id}`, {
        method: "DELETE",
        headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
      });
      if (!response.ok) throw new Error("Could not remove this designer's login account");
    }
  }

  async listUsers() {
    const [authResponse, profileResponse] = await Promise.all([
      fetch(`${baseUrl()}/auth/v1/admin/users?per_page=1000`, {
        headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
      }),
      fetch(`${baseUrl()}/rest/v1/crm_profiles?select=id,full_name,role`, {
        headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
      }),
    ]);
    if (!authResponse.ok || !profileResponse.ok) throw new Error("Unable to load Supabase users");
    const auth = await authResponse.json() as { users?: Array<{ id: string; email?: string; user_metadata?: { full_name?: string } }> };
    const profiles = await profileResponse.json() as Array<Pick<Profile, "id" | "full_name" | "role">>;
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return (auth.users ?? []).map((user) => {
      const profile = byId.get(user.id);
      const email = user.email ?? "";
      return {
        id: user.id,
        name: profile?.full_name ?? user.user_metadata?.full_name ?? email.split("@")[0] ?? "New user",
        email,
        role: profile?.role ?? "Unassigned",
      };
    });
  }
}
