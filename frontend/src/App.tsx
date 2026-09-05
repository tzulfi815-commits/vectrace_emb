import { useEffect, useState } from "react";
import {
  Bell,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Send,
  Sun,
  Target,
  Users,
  UserPlus,
  Wallet,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  DateRangeFilter,
  type DateRange,
  Empty,
  Modal,
  NavItem,
  OpportunityStageBar,
  SectionCard,
  StatCard,
  TextField,
  Tabs,
} from "./components/ui";
import "./styles/global.css";

type Role = "Admin" | "Caller" | "Designer";
type Lead = {
  id: string;
  company: string;
  phone: string;
  website?: string;
  social?: string;
  contactName: string;
  contactRole?: string;
  email?: string;
  country?: string;
  city?: string;
  state?: string;
  status: string;
  owner: string;
  capturedBy: string;
  assignedBy?: string;
  assignedAt?: string;
  hot: boolean;
  isNew: boolean;
  createdAt: string;
  calls: Array<{ duration: string; durationSeconds: number; notes: string; timestamp?: number }>;
  opportunity?: { createdAt: string } | null;
  stage?: number;
  followups: Array<{ date: string; time: string; notes: string }>;
};
type Session = { token: string; name: string; role: Role };
type AppNotification = { id: string; message: string; kind: string; createdAt: string; read: boolean };
type GmailConnection = { configured: boolean; connected: boolean; email: string | null };
type GmailMessage = { id: string; subject: string; from: string; to: string; date: string; body: string };
// Local development uses Vite's /api proxy. Cloudflare Pages supplies the
// public Render API URL at build time through VITE_API_URL.
const API = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const SESSION_STORAGE_KEY = "vectrace-crm-session";
const vapidKeyBytes = (value: string) => {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};
const displayPhone = (value: string) => value.replace(/[()]/g, "");
const attachmentLabel = (value: string) => {
  const name = value.split("/").pop() ?? value;
  try { return decodeURIComponent(name); } catch { return name; }
};
const uniqueAttachmentPaths = (paths: string[]) => Array.from(new Map(paths.map((path) => [attachmentLabel(path).toLocaleLowerCase(), path])).values());
const fileData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Could not read the selected file"));
  reader.readAsDataURL(file);
});
const downloadAttachment = async (path: string, token: string) => {
  if (!path.startsWith("/files/")) throw new Error("This older sample only has a file name. Upload the file again to make it downloadable.");
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Could not download this file");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url; link.download = attachmentLabel(path); link.click();
  URL.revokeObjectURL(url);
};
const downloadPdf = (filename: string, lines: string[]) => {
  const clean = (value: string) => value.replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, "\\$&");
  const content = `BT\n/F1 18 Tf\n50 748 Td\n(${clean(lines[0] ?? "Invoice")}) Tj\n/F1 10 Tf\n${lines.slice(1).map((line) => `0 -18 Td\n(${clean(line)}) Tj`).join("\n")}\nET`;
  const byteLength = (value: string) => new TextEncoder().encode(value).length;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
};
const leadStatusLabel = (lead: Lead) => {
  if (lead.status === "Closed - Won") return "Converted";
  if (lead.isNew || !lead.owner) return "New";
  if (lead.followups.length) return "Follow-ups";
  if (lead.opportunity) return "Opportunity";
  return "Working";
};
const opportunityStages = [
  {
    label: "Call Connected",
    detail: "Speak with the business and confirm the call was connected.",
  },
  { label: "POC Name & Email", detail: "Capture the decision-maker's name and email address." },
  {
    label: "Email Sent",
    detail: "Send the project email to the confirmed point of contact.",
  },
  { label: "Free Trial", detail: "Record the free trial before any charge." },
  {
    label: "Convert Client",
    detail: "Add the paid order to convert this lead into a client.",
  },
];
function AttachmentRows({
  files,
  onChoose,
  onAdd,
}: {
  files: string[];
  onChoose: (file: File) => void;
  onAdd: (files: File[]) => void;
}) {
  return (
    <div className="assignment-attachments">
      <span className="field-label">Attachments (brief, mockup, etc.)</span>
      <label className="attachment-dropzone">
        <Paperclip size={15} />
        <span>{files[0] ? attachmentLabel(files[0]) : "Choose a file"}</span>
        <input
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChoose(file);
          }}
        />
      </label>
      <label className="attachment-dropzone">
        <Paperclip size={15} />
        <span>
          {files.length > 1
            ? `${files.length - 1} additional file${files.length === 2 ? "" : "s"} selected`
            : "Add another file (optional)"}
        </span>
        <input
          type="file"
          multiple
          onChange={(event) => onAdd(Array.from(event.target.files ?? []))}
        />
      </label>
    </div>
  );
}
const matchesDateRange = (date: string, range: DateRange) => {
  if (range === "All Time") return true;
  const value = new Date(date).getTime();
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "This Month") cutoff.setMonth(now.getMonth(), 1);
  if (range === "This Year") cutoff.setMonth(0, 1);
  if (range === "Past 3 Months") cutoff.setMonth(now.getMonth() - 3);
  if (range === "Past 6 Months") cutoff.setMonth(now.getMonth() - 6);
  return value >= cutoff.getTime();
};
async function api<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    throw new Error(problem.error ?? problem.message ?? "Request failed");
  }
  return res.json();
}

function Login({ onLogin, theme, onToggleTheme }: { onLogin: (s: Session) => void; theme: "dark" | "light"; onToggleTheme: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onLogin(
        await api<Session>("/auth/login", "", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    }
  };
  return (
    <main className={`login login--${theme}`}>
      <div className="login-glow one" />
      <div className="login-glow two" />
      <button className="theme-corner" type="button" aria-label="Toggle theme" onClick={onToggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span>✂</span>
          <strong className="display">Vectrace Emb</strong>
        </div>
        <p>Digitizing · Vector Art · Custom Patches</p>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@stitchcrm.com"
          />
        </label>
        <label>
          Password
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button className="password-toggle-text" type="button" onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <><EyeOff size={16} /> Hide password</> : <><Eye size={16} /> Show password</>}</button>
        {error && <small className="error">{error}</small>}
        <button className="primary" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}

function InvitePassword({ theme, onToggleTheme }: { theme: "dark" | "light"; onToggleTheme: () => void }) {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token") ?? "";
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [error, setError] = useState(""), [done, setDone] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    try {
      await api<{ ok: boolean }>("/auth/invite-password", "", { method: "POST", body: JSON.stringify({ accessToken, password }) });
      window.history.replaceState({}, document.title, window.location.pathname);
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to set password."); }
  };
  return <main className={`login login--${theme}`}><button className="theme-corner" type="button" aria-label="Toggle theme" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button><form className="login-card" onSubmit={submit}><div className="login-brand"><span>âœ‚</span><strong className="display">Vectrace Emb</strong></div><p>{done ? "Password saved. You can now sign in." : "Create a password for your CRM account."}</p>{!done && <><label>New Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label><label>Confirm Password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} required /></label>{error && <small className="error">{error}</small>}<button className="primary" type="submit">Set Password</button></>}</form></main>;
}

function LeadDrawer({
  lead,
  token,
  close,
  refresh,
  initialTab = "Company Info",
}: {
  lead: Lead;
  token: string;
  close: () => void;
  refresh: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab),
    [seconds, setSeconds] = useState("30"),
    [notes, setNotes] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState({
      company: lead.company,
      phone: lead.phone,
      website: lead.website || "",
      social: lead.social || "",
      contactName: lead.contactName || "",
      contactRole: lead.contactRole || "",
      email: lead.email || "",
      city: lead.city || "",
      state: lead.state || "",
      country: lead.country || "",
    });
  const [pocModal, setPocModal] = useState(false);
  const [pocForm, setPocForm] = useState({ name: "", email: "", phone: "" });
  const [wonModal, setWonModal] = useState(false);
  const [wonForm, setWonForm] = useState({
    projectName: "",
    amount: "",
    notes: "",
  });
  const [activityTab, setActivityTab] = useState<"Call Logs" | "Email Logs">("Call Logs");
  const [activityPocId, setActivityPocId] = useState("");
  const [callLogNote, setCallLogNote] = useState("");
  const [emailLog, setEmailLog] = useState({ subject: "", note: "" });
  const [gmailConnection, setGmailConnection] = useState<GmailConnection | null>(null);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState("");
  const [stageFourForm, setStageFourForm] = useState({ projectName: "", projectType: "Digitizing", rateType: "Quoted" as "Quoted" | "Paid", amount: "", currency: "USD" as "USD" | "CAD" | "EUR", startDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [trialFiles, setTrialFiles] = useState<string[]>([]);
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialError, setTrialError] = useState("");
  const uploadTrialFile = async (file: File) => {
    const uploaded = await api<{ path: string }>("/files", token, {
      method: "POST",
      body: JSON.stringify({ name: file.name, data: await fileData(file) }),
    });
    return uploaded.path;
  };
  useEffect(() => {
    const trial = (lead.opportunity as any)?.trial;
    if (!trial?.given) return;
    setStageFourForm({
      projectName: trial.projectName ?? "",
      projectType: trial.projectType || "Digitizing",
      rateType: trial.rateType === "Paid" ? "Paid" : "Quoted",
      amount: String(trial.amount ?? ""),
      currency: trial.currency === "CAD" || trial.currency === "EUR" ? trial.currency : "USD",
      startDate: trial.startDate || trial.date || new Date().toISOString().slice(0, 10),
      notes: trial.notes ?? "",
    });
    setTrialFiles(trial.attachments ?? []);
  }, [lead.id]);
  const loadGmailConnection = async (): Promise<GmailConnection | null> => {
    try { const connection = await api<GmailConnection>("/gmail/status", token); setGmailConnection(connection); return connection; } catch { setGmailConnection(null); return null; }
  };
  useEffect(() => { loadGmailConnection(); }, [token]);
  const logCall = async () => {
    await api(`/leads/${lead.id}/calls`, token, {
      method: "POST",
      body: JSON.stringify({ durationSeconds: Number(seconds), notes }),
    });
    refresh();
  };
  const addOrder = async () => {
    if (!(lead.opportunity as any)?.trial?.given) {
      window.alert("Record the free trial before converting this lead into a client.");
      return;
    }
    const projectName = wonForm.projectName.trim();
    const amount = Number(wonForm.amount);
    if (!projectName || !amount || amount <= 0) return;
    await api(`/leads/${lead.id}/orders`, token, {
      method: "POST",
      body: JSON.stringify({ projectName, amount, notes: wonForm.notes.trim() }),
    });
    setWonModal(false);
    setWonForm({ projectName: "", amount: "", notes: "" });
    refresh();
  };
  const markLost = async () => {
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ status: "Closed - Lost" }),
    });
    refresh();
  };
  const markConnected = async () => {
    if (!lead.opportunity) return;
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        opportunity: { ...(lead.opportunity as any), connected: true },
      }),
    });
    refresh();
  };
  const addPoc = async () => {
    if (!lead.opportunity) return;
    if (!(lead.opportunity as any).connected) {
      window.alert("Mark the call as connected before adding the POC.");
      return;
    }
    setPocModal(true);
  };
  const savePoc = async () => {
    if (!lead.opportunity || !pocForm.name.trim() || !pocForm.email.trim()) return;
    const opportunity = lead.opportunity as any;
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        opportunity: {
          ...opportunity,
          pocs: [
            ...(opportunity.pocs ?? []),
            {
              id: crypto.randomUUID(),
              name: pocForm.name.trim(),
              role: "",
              email: pocForm.email.trim(),
              phone: pocForm.phone.trim(),
            },
          ],
        },
      }),
    });
    setPocModal(false);
    setPocForm({ name: "", email: "", phone: "" });
    refresh();
  };
  const deletePoc = async (pocId: string) => {
    if (!lead.opportunity || !window.confirm("Delete this point of contact?")) return;
    const opportunity = lead.opportunity as any;
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ opportunity: { ...opportunity, pocs: (opportunity.pocs ?? []).filter((poc: any) => poc.id !== pocId) } }),
    });
    if (activityPocId === pocId) setActivityPocId("");
    refresh();
  };
  const sendOpportunityEmail = async () => {
    if (!lead.opportunity) return;
    const opportunity = lead.opportunity as any;
    if (!opportunity.pocs?.some((poc: any) => poc.name && poc.email)) {
      window.alert("Add a POC name and email before sending the project email.");
      return;
    }
    setActivityTab("Email Logs");
  };
  const addOpportunityCallLog = async () => {
    if (!callLogNote.trim()) return;
    const poc = (lead.opportunity as any)?.pocs?.find((item: any) => item.id === activityPocId);
    await api(`/leads/${lead.id}/calls`, token, { method: "POST", body: JSON.stringify({ durationSeconds: 30, notes: `${poc ? `${poc.name}: ` : ""}${callLogNote.trim()}` }) });
    setCallLogNote(""); setActivityPocId(""); refresh();
  };
  const addOpportunityEmailLog = async () => {
    if (!lead.opportunity || !emailLog.subject.trim()) return;
    const opportunity = lead.opportunity as any;
    if ((opportunity.emailLogs ?? []).length) {
      setGmailError("The first project email is already saved for this opportunity.");
      return;
    }
    const poc = opportunity.pocs?.find((item: any) => item.id === activityPocId);
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ opportunity: { ...opportunity, emailSent: true, emailLogs: [...(opportunity.emailLogs ?? []), { id: crypto.randomUUID(), date: new Date().toISOString(), to: poc?.email ?? "", subject: emailLog.subject.trim(), note: emailLog.note.trim() }] } }),
    });
    setEmailLog({ subject: "", note: "" }); setActivityPocId("");
    refresh();
  };
  const connectGmail = async () => {
    setGmailError("");
    const popup = window.open("", "vectrace-gmail", "width=560,height=700");
    try {
      const result = await api<{ url: string }>("/gmail/connect", token, { method: "POST" });
      if (popup) popup.location.href = result.url;
      else window.location.assign(result.url);
      const interval = window.setInterval(() => {
        loadGmailConnection().then((connection) => {
          if (connection?.connected) window.clearInterval(interval);
        });
      }, 2500);
      window.setTimeout(() => window.clearInterval(interval), 5 * 60 * 1000);
    } catch (error) {
      popup?.close(); setGmailError(error instanceof Error ? error.message : "Could not connect Gmail.");
    }
  };
  const loadGmailEmails = async () => {
    if (!activityPocId) { setGmailError("Select the POC first, then load their Gmail messages."); return; }
    setGmailLoading(true); setGmailError("");
    try { setGmailMessages(await api<GmailMessage[]>(`/leads/${lead.id}/gmail-emails?pocId=${encodeURIComponent(activityPocId)}`, token)); }
    catch (error) { setGmailError(error instanceof Error ? error.message : "Could not load Gmail messages."); }
    finally { setGmailLoading(false); }
  };
  const useGmailMessage = (message: GmailMessage) => {
    setEmailLog({ subject: message.subject, note: message.body });
    setGmailMessages([]);
  };
  const giveTrial = async () => {
    if (!lead.opportunity) return;
    setTrialError("");
    const opportunity = lead.opportunity as any;
    if (!opportunity.emailSent) {
      window.alert("Send the project email before recording the free trial.");
      return;
    }
    const savedTrial = opportunity.trial ?? {};
    const projectName = stageFourForm.projectName.trim() || savedTrial.projectName || "Free Trial Project";
    if (!savedTrial.given && !stageFourForm.projectName.trim()) {
      window.alert("Add the project name before recording the free trial.");
      return;
    }
    setTrialSaving(true);
    try {
      await api(`/leads/${lead.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          opportunity: {
            ...opportunity,
            trial: {
              ...(opportunity.trial ?? {}),
              given: true,
              date: stageFourForm.startDate,
              projectName,
              projectType: stageFourForm.projectType,
              rateType: stageFourForm.rateType,
              amount: Number(stageFourForm.amount || 0),
              currency: stageFourForm.currency,
              startDate: stageFourForm.startDate,
              notes: stageFourForm.notes.trim(),
              attachments: trialFiles,
            },
          },
        }),
      });
      refresh();
    } catch (error) {
      setTrialError(error instanceof Error ? error.message : "Could not save the free trial.");
    } finally { setTrialSaving(false); }
  };
  const addFollowup = async () => {
    const date = window.prompt("Follow-up date (YYYY-MM-DD)");
    const time = window.prompt("Follow-up time");
    const followupNotes = window.prompt("Follow-up notes");
    if (!date || !time || !followupNotes) return;
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        followups: [...lead.followups, { date, time, notes: followupNotes }],
      }),
    });
    refresh();
  };
  const saveLead = async () => {
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    setEditing(false);
    refresh();
  };
  return (
    <div className="drawer-backdrop" onMouseDown={close}>
      <aside
        className={`lead-drawer ${tab === "Opportunity" ? "opportunity-workspace" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="drawer-topbar">
          <button className="drawer-close" onClick={close}>
            ← Close
          </button>
          <div className="drawer-actions">
            <button
              className="drawer-edit"
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil size={12} /> {editing ? "Cancel" : "Edit"}
            </button>
            <Badge text={lead.status} />
          </div>
        </header>
        <h2 className="display">{lead.company}</h2>
        <p className="drawer-location">
          {lead.city || "Wilmington"}, {lead.country || "USA"}
        </p>
        <p className="drawer-meta">
          Captured by {lead.capturedBy || "You"} · Assigned to{" "}
          {lead.owner || "You"} on {lead.createdAt}
          <br />
          Assigned by <b>{lead.owner || "You"}</b>
        </p>
        <p className="muted">
          Owner: {lead.owner} · Created {lead.createdAt}
        </p>
        <Tabs
          tabs={tab === "Opportunity" ? ["Opportunity"] : [
            "Company Info",
            "Contact Person",
            "Opportunity",
            "Call History",
            "Follow-ups",
          ]}
          active={tab}
          onChange={setTab}
        />
        {editing && (
          <div className="edit-lead-form">
            <h3>Edit Lead Details</h3>
            {[
              ["company", "Company Name"],
              ["phone", "Phone Number"],
              ["website", "Website"],
              ["social", "Social Media Links"],
              ["contactName", "Contact Name"],
              ["contactRole", "Contact Role"],
              ["email", "Contact Email"],
              ["city", "City"],
              ["state", "State"],
              ["country", "Country"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={draft[key as keyof typeof draft]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <button className="primary" onClick={saveLead}>
              Save Changes
            </button>
          </div>
        )}
        {tab === "Company Info" && (
          <div className="drawer-section">
            <div className="lead-info-card">
              <Building2 size={15} />
              <span>
                <small>Company Name</small>
                <strong>{lead.company}</strong>
              </span>
            </div>
            <div className="lead-info-card">
              <Phone size={15} />
              <span>
                <small>Phone Number</small>
                <strong>
                  {lead.phone ? displayPhone(lead.phone) : "Not obtained yet"}
                </strong>
              </span>
            </div>
            <div className="lead-info-card">
              <Search size={15} />
              <span>
                <small>Website</small>
                <strong>{lead.website || "Not obtained yet"}</strong>
              </span>
            </div>
            <div className="lead-info-card">
              <Send size={15} />
              <span>
                <small>Social Media</small>
                <strong>{lead.social || "Not added yet"}</strong>
              </span>
            </div>
            <b>Status</b>
            <select
              value={lead.status}
              onChange={async (event) => {
                await api(`/leads/${lead.id}`, token, {
                  method: "PATCH",
                  body: JSON.stringify({ status: event.target.value }),
                });
                refresh();
              }}
            >
              <option>Pending Approval</option>
              <option>Data Added</option>
              <option>Contacted</option>
              <option>Follow-up Sent</option>
              <option>Sample Provided</option>
              <option>Closed - Won</option>
              <option>Closed - Lost</option>
            </select>
            <button
              className="delete-lead"
              onClick={async () => {
                if (window.confirm("Delete this lead?")) {
                  await api(`/leads/${lead.id}`, token, { method: "DELETE" });
                  close();
                  refresh();
                }
              }}
            >
              Delete lead
            </button>
          </div>
        )}
        {tab === "Contact Person" && (
          <div className="drawer-section">
            <div className="lead-info-card">
              <Users size={15} />
              <span>
                <small>Name</small>
                <strong>{lead.contactName || "Not obtained yet"}</strong>
              </span>
            </div>
            <div className="lead-info-card">
              <BriefcaseBusiness size={15} />
              <span>
                <small>Designation</small>
                <strong>{lead.contactRole || "Receptionist"}</strong>
              </span>
            </div>
            <div className="lead-info-card">
              <Bell size={15} />
              <span>
                <small>Email</small>
                <strong>{lead.email || "Not obtained yet"}</strong>
              </span>
            </div>
            <p className="drawer-note">
              Progressive capture: fill this in as soon as it’s obtained on a
              future call — no need to touch Company Info.
            </p>
          </div>
        )}
        {tab === "Opportunity" && (
          <>
            {lead.opportunity ? (
              <>
                <OpportunityStageBar stage={lead.stage ?? 1} />
                <p className="stage-caption">
                  Stage {lead.stage ?? 1} —{" "}
                  {opportunityStages[(lead.stage ?? 1) - 1].label}
                </p>
                <section className="pipeline-stage-list">
                  {opportunityStages.map((item, index) => {
                    const number = index + 1;
                    const state =
                      number < (lead.stage ?? 1)
                        ? "complete"
                        : number === (lead.stage ?? 1)
                          ? "current"
                          : "upcoming";
                    return (
                      <div
                        className={`pipeline-stage ${state}`}
                        key={item.label}
                      >
                        <b>Stage {number}</b>
                        <span>{item.label}</span>
                        <small>{item.detail}</small>
                      </div>
                    );
                  })}
                </section>
                <section className="opportunity-card opportunity-documents">
                  <b>Documents</b>
                  <p>No documents uploaded yet. Add briefs or artwork from the related client order.</p>
                </section>
                <section className="opportunity-card">
                  <div className="opportunity-card-head">
                    <b>Points of Contact</b>
                    <button className="outline-button" onClick={addPoc}>
                      + Add POC
                    </button>
                  </div>
                  {(lead.opportunity as any).pocs?.length ? (
                    (lead.opportunity as any).pocs.map((p: any) => (
                      <div className="poc-row" key={p.id}>
                        <p>{p.name} · {p.email || "No email"}</p>
                        <button className="delete-lead" onClick={() => deletePoc(p.id)}>Delete</button>
                      </div>
                    ))
                  ) : (
                    <i>
                      No POC yet — capture their name and email to reach Stage
                      2.
                    </i>
                  )}
                </section>
                <section className="opportunity-card stage-activity-card">
                  <div className="opportunity-card-head"><b>Stage 3 Activity</b><span>⌃</span></div>
                  <div className="stage-activity-tabs"><button className={activityTab === "Call Logs" ? "active" : ""} onClick={() => setActivityTab("Call Logs")}>Call Logs ({lead.calls.length})</button><button className={activityTab === "Email Logs" ? "active" : ""} onClick={() => setActivityTab("Email Logs")}>Email Logs ({((lead.opportunity as any).emailLogs ?? []).length})</button></div>
                  {activityTab === "Email Logs" && ((lead.opportunity as any).emailLogs ?? []).slice(0, 1).map((item: any) => <details className="email-log-preview" key={item.id} open><summary><b>First Email</b><span>{item.subject}</span></summary><small>To: {item.to || "No recipient"}</small><p>{item.note || "No email body saved."}</p></details>)}
                  {activityTab === "Email Logs" && <div className="gmail-sync"><small>{gmailConnection?.connected ? `Connected Gmail: ${gmailConnection.email}` : "Connect your Gmail to import the subject and body of a matching email."}</small>{gmailConnection?.configured === false ? <small className="error">Gmail credentials are not configured.</small> : gmailConnection?.connected ? <button className="outline-button compact-button" disabled={gmailLoading} onClick={loadGmailEmails}>{gmailLoading ? "Loading Gmail..." : "Load matching Gmail emails"}</button> : <button className="outline-button compact-button" onClick={connectGmail}>Connect Gmail</button>}{gmailError && <small className="error">{gmailError}</small>}{gmailMessages.length > 0 && <div className="gmail-message-list">{gmailMessages.map((message) => <article className="gmail-message" key={message.id}><b>{message.subject}</b><small>{message.from} · {message.date}</small><p>{message.body || "No readable email body."}</p><button className="outline-button compact-button" onClick={() => useGmailMessage(message)}>Use this email</button></article>)}</div>}</div>}
                  {activityTab === "Call Logs" ? <><div className="activity-log-list">{lead.calls.length ? lead.calls.map((call, index) => <p key={index}>{call.duration} · {call.notes || "No notes"}</p>) : <p className="muted">No call logs yet.</p>}</div><div className="activity-form"><label className="field">Contact<select value={activityPocId} onChange={(event) => setActivityPocId(event.target.value)}><option value="">Select contact</option>{((lead.opportunity as any).pocs ?? []).map((poc: any) => <option key={poc.id} value={poc.id}>{poc.name}</option>)}</select></label><label className="field activity-notes">Call Notes<textarea value={callLogNote} onChange={(event) => setCallLogNote(event.target.value)} placeholder="Notes about the call..." /></label><button className="primary" disabled={!callLogNote.trim()} onClick={addOpportunityCallLog}>Add Call Log</button></div></> : <><div className="activity-log-list">{((lead.opportunity as any).emailLogs ?? []).length ? (lead.opportunity as any).emailLogs.map((item: any) => <p key={item.id}><b>{item.subject}</b> · {item.to || "No recipient"}</p>) : <p className="muted">No email logs yet.</p>}</div><div className="activity-form"><label className="field">Recipient<select value={activityPocId} onChange={(event) => setActivityPocId(event.target.value)}><option value="">Select POC</option>{((lead.opportunity as any).pocs ?? []).map((poc: any) => <option key={poc.id} value={poc.id}>{poc.name} — {poc.email}</option>)}</select></label><label className="field">Email Subject<input value={emailLog.subject} onChange={(event) => setEmailLog((value) => ({ ...value, subject: event.target.value }))} placeholder="e.g. Free trial project details" /></label><label className="field activity-notes">Email Notes<textarea value={emailLog.note} onChange={(event) => setEmailLog((value) => ({ ...value, note: event.target.value }))} placeholder="What was sent in this email?" /></label><button className="primary" disabled={!emailLog.subject.trim()} onClick={addOpportunityEmailLog}>Add Email Log</button></div></>}
                </section>
                <section className="opportunity-card stage-four-card">
                  <b>Stage 4 — Free Trial</b>
                  {(lead.opportunity as any).trial?.given ? <div className="stage-four-compact"><div className="opportunity-form-grid"><label className="field">Trial Date<input type="date" value={stageFourForm.startDate} onChange={(event) => setStageFourForm((form) => ({ ...form, startDate: event.target.value }))} /></label><label className="field">Rate Type<select value={stageFourForm.rateType} onChange={(event) => setStageFourForm((form) => ({ ...form, rateType: event.target.value as "Quoted" | "Paid" }))}><option>Quoted</option><option>Paid</option></select></label></div><AttachmentRows files={trialFiles} onChoose={(file) => uploadTrialFile(file).then((path) => setTrialFiles((files) => [path, ...files.slice(1)])).catch(() => window.alert("Could not upload this file"))} onAdd={(files) => Promise.all(files.map(uploadTrialFile)).then((paths) => setTrialFiles((current) => [...current, ...paths])).catch(() => window.alert("Could not upload these files"))} /><p className="muted">If Paid is selected, Stage 5 converts this lead into a client automatically.</p>{trialError && <small className="error">{trialError}</small>}<button className="outline-button" disabled={trialSaving} onClick={giveTrial}>{trialSaving ? "Saving..." : "Update Free Trial"}</button></div> : <div className="stage-four-form"><label className="field">Project Name<input value={stageFourForm.projectName} onChange={(event) => setStageFourForm((form) => ({ ...form, projectName: event.target.value }))} placeholder="e.g. Summer Cap Run" /></label><label className="field">Project Type<select value={stageFourForm.projectType} onChange={(event) => setStageFourForm((form) => ({ ...form, projectType: event.target.value }))}><option>Digitizing</option><option>Embroidery</option><option>Vector Art</option><option>Custom Patches</option></select></label><label className="field">Rate Type<select value={stageFourForm.rateType} onChange={(event) => setStageFourForm((form) => ({ ...form, rateType: event.target.value as "Quoted" | "Paid" }))}><option>Quoted</option><option>Paid</option></select></label><label className="field">{stageFourForm.rateType === "Paid" ? "Charge" : "Quoted Rate"}<input type="number" min="0" value={stageFourForm.amount} onChange={(event) => setStageFourForm((form) => ({ ...form, amount: event.target.value }))} placeholder="0" /></label><label className="field">Currency<select value={stageFourForm.currency} onChange={(event) => setStageFourForm((form) => ({ ...form, currency: event.target.value as "USD" | "CAD" | "EUR" }))}><option>USD</option><option>CAD</option><option>EUR</option></select></label><label className="field">Trial Date<input type="date" value={stageFourForm.startDate} onChange={(event) => setStageFourForm((form) => ({ ...form, startDate: event.target.value }))} /></label><label className="field stage-four-notes">Project / Trial Notes<textarea value={stageFourForm.notes} onChange={(event) => setStageFourForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Trial instructions, colors, format, etc." /></label><AttachmentRows files={trialFiles} onChoose={(file) => uploadTrialFile(file).then((path) => setTrialFiles([path])).catch(() => window.alert("Could not upload this file"))} onAdd={(files) => Promise.all(files.map(uploadTrialFile)).then((paths) => setTrialFiles((current) => [...current, ...paths])).catch(() => window.alert("Could not upload these files"))} />{trialError && <small className="error">{trialError}</small>}<button className="primary" disabled={trialSaving || !(lead.opportunity as any).emailSent || !stageFourForm.projectName.trim()} onClick={giveTrial}>{trialSaving ? "Saving Free Trial..." : "Save Free Trial & Add Client"}</button></div>}
                </section>
                <p className="muted">
                  Complete each step in order: connected call, POC details,
                  project email, free trial, then client conversion.
                </p>
                {!(lead.opportunity as any).connected && (
                  <button className="demo-button" onClick={markConnected}>
                    Mark call connected
                  </button>
                )}
                {(lead.opportunity as any).connected &&
                  !(lead.opportunity as any).pocs?.some(
                    (poc: any) => poc.name && poc.email,
                  ) && (
                    <button className="demo-button" onClick={addPoc}>
                      Add POC name & email → Stage 2
                    </button>
                  )}
                {(lead.opportunity as any).pocs?.some(
                  (poc: any) => poc.name && poc.email,
                ) &&
                  !(lead.opportunity as any).emailSent && (
                    <button className="demo-button" onClick={sendOpportunityEmail}>
                      Send project email → Stage 3
                    </button>
                  )}
                {lead.status !== "Closed - Won" && lead.status !== "Closed - Lost" && (
                  <div className="opportunity-outcomes">
                    <button className="primary mark-won" onClick={() => setWonModal(true)}>Mark Won & Convert Client</button>
                    <button className="danger-button mark-lost" onClick={markLost}>Mark Lost</button>
                  </div>
                )}
              </>
            ) : (
              <Empty text="Not an opportunity yet — log the first call and this pipeline starts automatically." />
            )}
          </>
        )}
        {tab === "Call History" && (
          <div className="call-panel">
            <div className="call-input">
              <input
                type="number"
                min="1"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
              <span>seconds</span>
            </div>
            {Number(seconds) > 0 && Number(seconds) < 30 && (
              <small className="error">
                Under 30 seconds — this call will be logged but won’t count
                toward call targets.
              </small>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call notes"
            />
            <button className="primary" onClick={logCall}>
              Log Call
            </button>
            {lead.calls.map((c, i) => (
              <p className={c.durationSeconds < 30 ? "uncounted" : ""} key={i}>
                {c.duration} · {c.notes || "No notes"}
                {c.durationSeconds < 30 && " · Not counted"}
              </p>
            ))}
          </div>
        )}
        {tab === "Follow-ups" &&
          (lead.followups.length ? (
            <div>
              {lead.followups.map((f, i) => (
                <p key={i}>
                  {f.date} {f.time} · {f.notes}
                </p>
              ))}
            </div>
          ) : (
            <Empty text="No follow-ups yet." />
          ))}
        {tab === "Follow-ups" && (
          <button className="primary" onClick={addFollowup}>
            Add follow-up
          </button>
        )}
      </aside>
      {pocModal && <Modal title="Add Point of Contact" onClose={() => setPocModal(false)}><div className="form-grid"><TextField label="POC Full Name" value={pocForm.name} onChange={(name) => setPocForm((form) => ({ ...form, name }))} placeholder="e.g. Priya Shah" /><TextField label="POC Email" value={pocForm.email} onChange={(email) => setPocForm((form) => ({ ...form, email }))} placeholder="name@company.com" /><TextField label="Phone Number (optional)" value={pocForm.phone} onChange={(phone) => setPocForm((form) => ({ ...form, phone }))} placeholder="+1 555 555 0100" /></div><button className="primary" disabled={!pocForm.name.trim() || !pocForm.email.trim()} onClick={savePoc}>Save POC</button></Modal>}
      {wonModal && <Modal title="Mark Won & Convert Client" onClose={() => setWonModal(false)}><form className="won-order-form" onSubmit={(event) => { event.preventDefault(); addOrder(); }}><p className="muted">Add the paid order details. This will complete Stage 5 and convert the lead into a client.</p><TextField label="Paid Project Name" value={wonForm.projectName} onChange={(projectName) => setWonForm((form) => ({ ...form, projectName }))} placeholder="e.g. Company Logo Embroidery" /><label className="field">Paid Amount (USD)<input type="number" min="0" step="0.01" value={wonForm.amount} onChange={(event) => setWonForm((form) => ({ ...form, amount: event.target.value }))} placeholder="0.00" required /></label><label className="field">Order Notes (optional)<textarea value={wonForm.notes} onChange={(event) => setWonForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Work details, delivery notes, or special instructions..." /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setWonModal(false)}>Cancel</button><button className="primary" type="submit" disabled={!wonForm.projectName.trim() || Number(wonForm.amount) <= 0}>Mark Won & Convert</button></div></form></Modal>}
    </div>
  );
}

function Dashboard({
  session,
  leads,
  range,
  setRange,
}: {
  session: Session;
  leads: Lead[];
  range: DateRange;
  setRange: (r: DateRange) => void;
}) {
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>(leads);
  useEffect(() => {
    if (session.role === "Admin")
      api<Array<unknown>>(
        `/clients?createdAtRange=${encodeURIComponent(range)}`,
        (session as Session).token,
      )
        .then((items) => setActiveClients(items.length))
        .catch(() => setActiveClients(0));
  }, [session, range]);
  useEffect(() => {
    if (session.role === "Admin")
      api<Lead[]>("/leads", session.token)
        .then(setAllLeads)
        .catch(() => setAllLeads(leads));
  }, [session, leads]);
  const counted = leads.flatMap((l) => l.calls).filter((c) => c.durationSeconds >= 30).length;
  if (session.role === "Caller") {
    const today = new Date();
    const isToday = (timestamp?: number) => timestamp ? new Date(timestamp).toDateString() === today.toDateString() : false;
    const dayCalls = leads.flatMap((lead) => lead.calls).filter((call) => isToday(call.timestamp));
    const countedToday = dayCalls.filter((call) => call.durationSeconds >= 30).length;
    const shortToday = dayCalls.filter((call) => call.durationSeconds < 30).length;
    const target = 150;
    const followupsToday = leads.flatMap((lead) => lead.followups.map((followup) => ({ lead, followup }))).filter(({ followup }) => new Date(followup.date).toDateString() === today.toDateString());
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
    const weeklyCalls = leads.flatMap((lead) => lead.calls).filter((call) => call.timestamp && new Date(call.timestamp) >= weekStart && call.durationSeconds >= 30).length;
    const opportunities = leads.filter((lead) => lead.opportunity && !["Closed - Won", "Closed - Lost"].includes(lead.status));
    const won = leads.filter((lead) => lead.status === "Closed - Won").length;
    const conversion = leads.length ? Math.round((opportunities.length / leads.length) * 100) : 0;
    return (
      <>
        <header className="page-header">
          <div>
            <h1 className="page-title display">Your day at a glance</h1>
            <p className="muted">
              Daily target: 150 new calls. Follow-ups are extra; calls under 30s
              don’t count.
            </p>
          </div>
        </header>
        <div className="stats">
          <StatCard
            icon={Phone}
            label="Calls Made Today"
            value={countedToday}
            sub="Live counter"
          />
          <StatCard
            icon={Target}
            label="Calls Remaining"
            value={Math.max(target - countedToday, 0)}
            sub="To hit 150 target"
          />
          <StatCard
            icon={PhoneCall}
            label="Interested Today"
            value={opportunities.length}
            sub="Your pipeline"
          />
          <StatCard
            icon={Target}
            label="Conversion Rate"
            value={`${conversion}%`}
            sub="Interested / worked"
          />
        </div>
        <div className="caller-dashboard-grid">
          <div className="caller-dashboard-main">
            <SectionCard title="Daily Target Progress">
              <div className="caller-target-summary"><b>{countedToday} / {target} new calls</b><span>{Math.max(target - countedToday, 0) ? `${Math.max(target - countedToday, 0)} to go` : "Target reached"}</span></div>
              <div className="target"><span style={{ width: `${Math.min(100, (countedToday / target) * 100)}%` }} /></div>
              <div className="caller-target-foot"><span>+{followupsToday.length} follow-up calls today (extra)</span><b>{countedToday + followupsToday.length} total calls today</b></div>
              {shortToday > 0 && <small className="muted">{shortToday} short call{shortToday === 1 ? "" : "s"} logged today did not count.</small>}
              <p className="muted">Counter resets daily at 12:00 AM local time.</p>
            </SectionCard>
            <SectionCard title="Your Follow-ups Today">
              {followupsToday.length ? <div className="caller-followups">{followupsToday.map(({ lead, followup }, index) => <div key={`${lead.id}-${index}`}><span><b>{lead.company}</b> — {followup.notes}</span><small>{followup.time}</small></div>)}</div> : <Empty text="No follow-ups scheduled for today." />}
            </SectionCard>
          </div>
          <SectionCard title="Your Week" right={<small className="muted">Personal</small>}><div className="caller-week"><span>Calls made <b>{weeklyCalls}</b></span><span>Opportunities <b>{opportunities.length}</b></span><span>Closed <b>{won}</b></span><span>Conversion <b>{conversion}%</b></span></div></SectionCard>
        </div>
      </>
    );
  }
  return (
    <>
      <header className="page-header designer-portal-header">
        <div>
          <h1 className="page-title display">Welcome back</h1>
          <p className="muted">
            Here’s what’s moving across leads and clients — payment details live
            in Finance.
          </p>
        </div>
      </header>
      <div className="dashboard-range">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <div className="stats designer-summary-stats">
        <StatCard
          icon={Phone}
          label="Total Leads"
          value={leads.length}
          sub={`${leads.filter((l) => l.status === "Pending Approval").length} pending`}
        />
        <StatCard
          icon={Users}
          label="Active Clients"
          value={activeClients ?? "—"}
          sub="In this range"
        />
        <StatCard
          icon={Target}
          label="Open Opportunities"
          sub="In the pipeline"
          value={
            leads.filter(
              (l) =>
                l.opportunity &&
                !["Closed - Won", "Closed - Lost"].includes(l.status),
            ).length
          }
        />
        <StatCard
          icon={Bell}
          label="Follow-ups Today"
          value={allLeads.flatMap((l) => l.followups).length}
          sub="Always today, not range-filtered"
        />
      </div>
      <div className="two-col">
        <SectionCard title="Today’s Follow-ups">
          {allLeads
            .flatMap((l) =>
              l.followups.map((f) => `${l.company} — ${f.notes} (${f.time})`),
            )
            .map((x) => (
              <p className="followup-row" key={x}>
                {x}
              </p>
            ))}
          {!allLeads.flatMap((l) => l.followups).length && (
            <Empty text="No follow-ups today." />
          )}
        </SectionCard>
        <SectionCard title="Top Callers">
          <p className="caller-row">
            Hamza ·{" "}
            {
              leads.filter((l) => l.owner === "Hamza").flatMap((l) => l.calls)
                .length
            }{" "}
            calls
          </p>
          <p className="caller-row">
            Sara ·{" "}
            {
              leads.filter((l) => l.owner === "Sara").flatMap((l) => l.calls)
                .length
            }{" "}
            calls
          </p>
        </SectionCard>
      </div>
    </>
  );
}

function LeadsView({
  session,
  token,
  leads,
  refresh,
  onNewOpportunity,
  initialLeadId,
  onInitialLeadOpened,
}: {
  session: Session;
  token: string;
  leads: Lead[];
  refresh: () => void;
  onNewOpportunity: (lead: Lead) => void;
  initialLeadId?: string | null;
  onInitialLeadOpened?: () => void;
}) {
  const [selected, setSelected] = useState<Lead | null>(null),
    [selectedTab, setSelectedTab] = useState("Company Info"),
    [tab, setTab] = useState(
      session.role === "Admin" ? "All Leads" : "Assigned to Me",
    ),
    [adding, setAdding] = useState(false),
    [company, setCompany] = useState(""),
    [phone, setPhone] = useState(""),
    [website, setWebsite] = useState(""),
    [social, setSocial] = useState(""),
    [contactName, setContactName] = useState(""),
    [contactEmail, setContactEmail] = useState(""),
    [importStep, setImportStep] = useState<
      "file" | "mapping" | "result" | null
    >(null),
    [importHeaders, setImportHeaders] = useState<string[]>([]),
    [importRows, setImportRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [importResult, setImportResult] = useState<{
      added: number;
      skipped: number;
    } | null>(null),
    [error, setError] = useState(""),
    [filterStatus, setFilterStatus] = useState("All"),
    [assignTo, setAssignTo] = useState("All Callers"),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [leadRange, setLeadRange] = useState<DateRange>("All Time"),
    [leadAddedFrom, setLeadAddedFrom] = useState(""),
    [leadAddedTo, setLeadAddedTo] = useState(""),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1),
    [leadRows, setLeadRows] = useState<Lead[]>(leads),
    [callers, setCallers] = useState<Array<{ id: string; name: string; role: string }>>([]),
    [assigningLead, setAssigningLead] = useState<Lead | null>(null),
    [bulkAssigning, setBulkAssigning] = useState(false),
    [assignmentBusy, setAssignmentBusy] = useState(false),
    [assignmentError, setAssignmentError] = useState("");
  useEffect(() => {
    setLeadRows(leads);
  }, [leads]);
  // A save reloads the CRM data. Keep the same lead drawer open and replace
  // its data with the saved version instead of sending the user back to Leads.
  useEffect(() => {
    if (!selected) return;
    const updated = leads.find((lead) => lead.id === selected.id);
    if (updated) setSelected(updated);
  }, [leads, selected?.id]);
  useEffect(() => {
    if (!initialLeadId) return;
    const lead = leads.find((item) => item.id === initialLeadId);
    if (!lead) return;
    setSelected(lead);
    setSelectedTab("Company Info");
    onInitialLeadOpened?.();
  }, [initialLeadId, leads, onInitialLeadOpened]);
  useEffect(() => {
    api<Lead[]>(`/leads?createdAtRange=${encodeURIComponent(leadRange)}`, token)
      .then(setLeadRows)
      .catch(() => {});
  }, [leadRange, token]);
  useEffect(() => {
    if (session.role === "Admin") api<Array<{ id: string; name: string; role: string }>>("/users", token).then((users) => setCallers(users.filter((user) => user.role === "Caller"))).catch(() => {});
  }, [session.role, token]);
  const assignLead = async (caller: { name: string }) => {
    if (!assigningLead) return;
    setAssignmentBusy(true);
    setAssignmentError("");
    try {
      await api(`/leads/${assigningLead.id}`, token, { method: "PATCH", body: JSON.stringify({ owner: caller.name.split(" ")[0] }) });
      setAssigningLead(null);
      refresh();
    } catch (error) { setAssignmentError(error instanceof Error ? error.message : "Could not assign this lead."); }
    finally { setAssignmentBusy(false); }
  };
  const assignSelected = async (caller: { id: string }) => {
    if (!selectedIds.length) return;
    setAssignmentBusy(true);
    setAssignmentError("");
    try {
      const updated = await api<Lead[]>("/leads/bulk-assign", token, { method: "POST", body: JSON.stringify({ leadIds: selectedIds, callerId: caller.id }) });
      setLeadRows((rows) => rows.map((lead) => updated.find((item) => item.id === lead.id) ?? lead));
      setSelectedIds([]);
      setBulkAssigning(false);
      refresh();
    } catch (error) { setAssignmentError(error instanceof Error ? error.message : "Could not assign the selected leads."); }
    finally { setAssignmentBusy(false); }
  };
  let shown = leadRows;
  if (tab === "Captured by Me")
    shown = leadRows.filter((l) => l.capturedBy === session.name);
  if (tab === "Assigned to Me")
    shown = leadRows.filter((l) => l.owner === session.name.split(" ")[0]);
  if (filterStatus === "New")
    shown = shown.filter((lead) => lead.isNew || !lead.owner);
  if (filterStatus === "Working")
    shown = shown.filter(
      (lead) =>
        !lead.isNew &&
        Boolean(lead.owner) &&
        !lead.followups.length &&
        !lead.opportunity &&
        !["Closed - Won", "Closed - Lost"].includes(lead.status),
    );
  if (filterStatus === "Follow-ups")
    shown = shown.filter((lead) => lead.followups.length > 0);
  if (filterStatus === "Opportunities")
    shown = shown.filter((lead) => Boolean(lead.opportunity));
  if (filterStatus === "Converted")
    shown = shown.filter((lead) => lead.status === "Closed - Won");
  if (assignTo !== "All Callers")
    shown = shown.filter((lead) => lead.owner === assignTo);
  if (leadAddedFrom)
    shown = shown.filter((lead) => lead.createdAt >= leadAddedFrom);
  if (leadAddedTo)
    shown = shown.filter((lead) => lead.createdAt.slice(0, 10) <= leadAddedTo);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedShown = shown.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const add = async () => {
    try {
      await api("/leads", token, {
        method: "POST",
        body: JSON.stringify({
          company,
          phone,
          website,
          social,
          contactName,
          email: contactEmail,
        }),
      });
      setAdding(false);
      setCompany("");
      setPhone("");
      setWebsite("");
      setSocial("");
      setContactName("");
      setContactEmail("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const [header, ...lines] = text.trim().split(/\r?\n/);
    const columns = header
      .split(",")
      .map((value) => value.trim().toLowerCase());
    const rows = lines.map((line) => {
      const values = line.split(",");
      return {
        company:
          values[
            columns.findIndex((column) =>
              /company|business|client/.test(column),
            )
          ]?.trim() ?? "",
        phone:
          values[
            columns.findIndex((column) => /phone|number|mobile/.test(column))
          ]?.trim() ?? "",
      };
    });
    const result = await api<{ added: number; skipped: number }>(
      "/leads/import",
      token,
      { method: "POST", body: JSON.stringify({ rows }) },
    );
    window.alert(
      `Added ${result.added} · skipped ${result.skipped} duplicate/missing-field row(s).`,
    );
    refresh();
  };
  const orderClient: any = null,
    orderFiles: string[] = [],
    orderForm: any = {};
  let orderType: "Unpaid" | "Paid" = Math.random() > 0.5 ? "Unpaid" : "Paid";
  const setOrderClient = (_value: any) => {},
    setOrderType = (_value: any) => {},
    setOrderFiles = (_value: any) => {},
    setOrderForm = (_value: any) => {},
    addOrder = () => {};
  const selectImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const [header, ...lines] = (await file.text()).trim().split(/\r?\n/);
    const headers = header.split(",").map((value) => value.trim());
    setImportHeaders(headers);
    setImportRows(
      lines
        .filter(Boolean)
        .map((line) => line.split(",").map((value) => value.trim())),
    );
    setMapping({
      company: headers.find((h) => /company|business/i.test(h)) || "",
      phone: headers.find((h) => /phone|mobile|number/i.test(h)) || "",
    });
  };
  const runImport = async () => {
    const rows = importRows
      .map((values) =>
        Object.fromEntries(
          Object.entries(mapping).map(([field, header]) => [
            field,
            values[importHeaders.indexOf(header)] ?? "",
          ]),
        ),
      )
      .map((row) => ({
        ...row,
        social: row.address
          ? `Address: ${row.address}${row.zipcode ? `, ${row.zipcode}` : ""}`
          : "",
      }));
    const result = await api<{ added: number; skipped: number }>(
      "/leads/import",
      token,
      { method: "POST", body: JSON.stringify({ rows }) },
    );
    setImportResult(result);
    setImportStep("result");
    refresh();
  };
  const deleteSelected = async () => {
    if (
      !selectedIds.length ||
      !window.confirm(`Delete ${selectedIds.length} selected lead(s)?`)
    )
      return;
    await Promise.all(
      selectedIds.map((id) => api(`/leads/${id}`, token, { method: "DELETE" })),
    );
    setSelectedIds([]);
    refresh();
  };
  const togglePageSelection = (checked: boolean) =>
    setSelectedIds(
      checked
        ? Array.from(
            new Set([...selectedIds, ...pagedShown.map((lead) => lead.id)]),
          )
        : selectedIds.filter(
            (id) => !pagedShown.some((lead) => lead.id === id),
          ),
    );
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Leads</h1>
          <p className="muted">
            Leads are raw data, not the pipeline — the real pipeline lives in
            Opportunities.
          </p>
        </div>
        <div className="header-actions">
          {session.role === "Admin" && selectedIds.length > 0 && (
            <button className="outline-button bulk-assign-button" onClick={() => setBulkAssigning(true)}><UserPlus size={15} /> Assign to Agent ({selectedIds.length})</button>
          )}
          {session.role === "Admin" && selectedIds.length > 0 && (
            <button className="danger-button" onClick={deleteSelected}>
              Delete Selected ({selectedIds.length})
            </button>
          )}
          <button
            className="demo-button import-button"
            onClick={() => setImportStep("file")}
          >
            Import Leads
          </button>
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add Lead
          </button>
        </div>
      </header>
      <Tabs
        tabs={
          session.role === "Admin"
            ? [
                "All Leads",
                "Captured by Me",
                `Pending Approval (${leads.filter((l) => l.status === "Pending Approval").length})`,
              ]
            : ["Assigned to Me", "Captured by Me"]
        }
        active={tab}
        onChange={setTab}
      />
      <div className="lead-filters">
        <label>
          Filter
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
          >
            <option>All</option>
            <option>Working</option>
            <option>New</option>
            <option>Follow-ups</option>
            <option>Opportunities</option>
            <option>Converted</option>
          </select>
        </label>
        {session.role === "Admin" && (
          <label>
            Assign to
            <select
              value={assignTo}
              onChange={(event) => setAssignTo(event.target.value)}
            >
              <option>All Callers</option>
              {[...new Set(leads.map((lead) => lead.owner))]
                .filter(Boolean)
                .map((owner) => (
                  <option key={owner}>{owner}</option>
                ))}
            </select>
          </label>
        )}
        <DateRangeFilter value={leadRange} onChange={setLeadRange} />
        <label>
          Added From
          <input
            type="date"
            value={leadAddedFrom}
            onChange={(event) => setLeadAddedFrom(event.target.value)}
          />
        </label>
        <label>
          Added To
          <input
            type="date"
            value={leadAddedTo}
            onChange={(event) => setLeadAddedTo(event.target.value)}
          />
        </label>
      </div>
      <div className="table">
        <div className="lead-table-head">
          {session.role === "Admin" ? (
            <input
              type="checkbox"
              checked={
                pagedShown.length > 0 &&
                pagedShown.every((lead) => selectedIds.includes(lead.id))
              }
              onChange={(event) => togglePageSelection(event.target.checked)}
            />
          ) : (
            <span />
          )}
          <span>Company</span>
          <span>Phone</span>
          <span>Contact</span>
          <span>City / State</span>
          <span>Status</span>
          <span>Assigned By</span>
          <span>Assigned To</span>
          <span>Assign Date</span>
          <span>Actions</span>
          <span></span>
        </div>
        {pagedShown.map((l) => (
          <div
            className="lead-row"
            key={l.id}
            role="button"
            tabIndex={0}
            onClick={async () => {
              setSelected(l);
              if (l.isNew)
                await api(`/leads/${l.id}/mark-seen`, token, {
                  method: "POST",
                }).catch(() => {});
            }}
          >
            {session.role === "Admin" ? (
              <input
                type="checkbox"
                checked={selectedIds.includes(l.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  setSelectedIds((ids) =>
                    event.target.checked
                      ? [...ids, l.id]
                      : ids.filter((id) => id !== l.id),
                  )
                }
              />
            ) : (
              <span />
            )}
            <strong>
              {l.company}
              <small className="lead-created">
                Created{" "}
                {new Date(l.createdAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </small>
            </strong>
            <span className="lead-phone">{displayPhone(l.phone)}</span>
            <span>{l.contactName || "Pending"}</span>
            <span>
              {[l.city, l.state || l.country].filter(Boolean).join(", ") ||
                "Not added"}
            </span>
            <Badge text={leadStatusLabel(l)} />
            <span>{l.assignedBy || "—"}</span>
            <span>{l.owner || "Unassigned"}</span>
            <span>
              {l.assignedAt
                ? new Date(l.assignedAt).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })
                : "—"}
            </span>
            <div className="lead-actions">
              <button
                className="row-action"
                aria-label="Edit lead"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(l);
                }}
              >
                <Pencil size={14} />
              </button>
              {session.role === "Admin" && (l.isNew || !l.owner) && (
                <button
                  className="row-action assign-row-action"
                  aria-label="Assign lead"
                  title="Assign new lead"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAssigningLead(l);
                  }}
                >
                  <UserPlus size={14} />
                </button>
              )}
              <button
                className="row-action convert-action"
                aria-label="Convert to opportunity"
                onClick={(event) => {
                  event.stopPropagation();
                  if (l.opportunity) {
                    setSelectedTab("Opportunity");
                    setSelected(l);
                    return;
                  }
                  onNewOpportunity(l);
                }}
              >
                <ArrowRight size={14} />
              </button>
              {session.role === "Admin" && (
                <button
                  className="row-action delete-action"
                  aria-label="Delete lead"
                  onClick={async (event) => {
                    event.stopPropagation();
                    if (window.confirm(`Delete ${l.company}?`)) {
                      await api(`/leads/${l.id}`, token, { method: "DELETE" });
                      refresh();
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <ChevronRight size={18} />
          </div>
        ))}
        {!shown.length && <Empty text="No leads here yet." />}
      </div>
      {shown.length > 0 && (
        <div className="pagination">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, shown.length)} of {shown.length}
          </span>
          <label>
            Rows per page{" "}
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
          <button
            className="demo-button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <button
            className="demo-button"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
      {adding && (
        <div className="modal-backdrop">
          <div className="quick-modal">
            <h3 className="display">Add Lead</h3>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company Name *"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone Number *"
            />
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website"
            />
            <input
              value={social}
              onChange={(e) => setSocial(e.target.value)}
              placeholder="Social Media Links"
            />
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact Name (optional)"
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Contact Email (optional)"
            />
            {error && <small className="error">{error}</small>}
            <button className="primary" onClick={add}>
              Add Lead
            </button>
            <button onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {assigningLead && <Modal title={`Assign ${assigningLead.company}`} onClose={() => !assignmentBusy && setAssigningLead(null)}><div className="assign-caller-modal"><p className="muted">Choose the caller who should receive this new lead.</p>{assignmentError && <small className="error">{assignmentError}</small>}{callers.map((caller) => <button key={caller.id} disabled={assignmentBusy} className="assign-caller-option" onClick={() => assignLead(caller)}><UserPlus size={16} /><span><b>{assignmentBusy ? "Assigning..." : caller.name}</b><small>Caller agent</small></span></button>)}{!callers.length && <Empty text="No caller agents are available." />}</div></Modal>}
      {bulkAssigning && <Modal title={`Assign ${selectedIds.length} selected lead${selectedIds.length === 1 ? "" : "s"}`} onClose={() => !assignmentBusy && setBulkAssigning(false)}><div className="assign-caller-modal"><p className="muted">Choose the caller who should receive all selected leads.</p>{assignmentError && <small className="error">{assignmentError}</small>}{callers.map((caller) => <button key={caller.id} disabled={assignmentBusy} className="assign-caller-option" onClick={() => assignSelected(caller)}><UserPlus size={16} /><span><b>{assignmentBusy ? "Assigning..." : caller.name}</b><small>Caller agent</small></span></button>)}{!callers.length && <Empty text="No caller agents are available." />}</div></Modal>}
      {orderClient && (
        <div className="modal-backdrop">
          <div className="quick-modal client-modal">
            <button
              className="modal-close"
              onClick={() => setOrderClient(null)}
            >
              ×
            </button>
            <h3>Add Order — {orderClient.company}</h3>
            <label className="field">
              Order Type
              <div className="client-type-toggle">
                <button
                  className={orderType === "Unpaid" ? "active" : ""}
                  onClick={() => setOrderType("Unpaid")}
                >
                  Unpaid
                </button>
                <button
                  className={orderType === "Paid" ? "active" : ""}
                  onClick={() => setOrderType("Paid")}
                >
                  Paid
                </button>
              </div>
            </label>
            <label className="field">
              Project Type
              <select
                value={orderForm.service}
                onChange={(e) =>
                  setOrderForm((v: typeof orderForm) => ({
                    ...v,
                    service: e.target.value,
                  }))
                }
              >
                <option>Digitizing</option>
                <option>Embroidery</option>
                <option>Vector Art</option>
                <option>Custom Patches</option>
              </select>
            </label>
            <label className="field">
              Project Name
              <input
                value={orderForm.projectName}
                onChange={(e) =>
                  setOrderForm((v: typeof orderForm) => ({
                    ...v,
                    projectName: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              Start Date
              <input
                type="date"
                value={orderForm.startDate}
                onChange={(e) =>
                  setOrderForm((v: typeof orderForm) => ({
                    ...v,
                    startDate: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              {orderType === "Unpaid" ? "Quoted Rate (USD)" : "Charge (USD)"}
              <input
                type="number"
                value={orderForm.amount}
                onChange={(e) =>
                  setOrderForm((v: typeof orderForm) => ({
                    ...v,
                    amount: e.target.value,
                  }))
                }
              />
            </label>
            <AttachmentRows
              files={orderFiles}
              onChoose={(file) =>
                setOrderFiles((files: string[]) => [file.name, ...files.slice(1)])
              }
              onAdd={(files) =>
                setOrderFiles((current: string[]) => [
                  ...current,
                  ...files.map((file) => file.name),
                ])
              }
            />
            <button
              className="primary"
              disabled={!orderForm.projectName || !orderForm.amount}
              onClick={addOrder}
            >
              Add Order
            </button>
          </div>
        </div>
      )}
      {orderClient && (
        <div className="modal-backdrop">
          <div className="quick-modal client-modal">
            <button
              className="modal-close"
              onClick={() => setOrderClient(null)}
            >
              ×
            </button>
            <h3 className="display">Add Order — {orderClient.company}</h3>
            <label className="field">
              Order Type
              <div className="client-type-toggle">
                <button
                  className={orderType === "Unpaid" ? "active" : ""}
                  onClick={() => setOrderType("Unpaid")}
                >
                  Unpaid
                </button>
                <button
                  className={orderType === "Paid" ? "active" : ""}
                  onClick={() => setOrderType("Paid")}
                >
                  Paid
                </button>
              </div>
            </label>
            <label className="field">
              Project Type
              <select
                value={orderForm.service}
                onChange={(e) =>
                  setOrderForm((v: any) => ({ ...v, service: e.target.value }))
                }
              >
                <option>Digitizing</option>
                <option>Embroidery</option>
                <option>Vector Art</option>
                <option>Custom Patches</option>
              </select>
            </label>
            <label className="field">
              Project Name
              <input
                value={orderForm.projectName}
                onChange={(e) =>
                  setOrderForm((v: any) => ({
                    ...v,
                    projectName: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              Start Date
              <input
                type="date"
                value={orderForm.startDate}
                onChange={(e) =>
                  setOrderForm((v: any) => ({
                    ...v,
                    startDate: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              {orderType === "Unpaid" ? "Quoted Rate (USD)" : "Charge (USD)"}
              <input
                type="number"
                value={orderForm.amount}
                onChange={(e) =>
                  setOrderForm((v: any) => ({ ...v, amount: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Attachments (multiple files)
              <input
                type="file"
                multiple
                onChange={(event) =>
                  setOrderFiles(
                    Array.from(event.target.files ?? []).map(
                      (file) => file.name,
                    ),
                  )
                }
              />
              <small className="muted">
                {orderFiles.length
                  ? `${orderFiles.length} file(s) selected`
                  : "Attach briefs, mockups, or artwork"}
              </small>
            </label>
            <button
              className="primary"
              disabled={!orderForm.projectName || !orderForm.amount}
              onClick={addOrder}
            >
              Add Order
            </button>
          </div>
        </div>
      )}
      {importStep && (
        <div className="modal-backdrop">
          <div className="quick-modal import-modal">
            <button className="modal-close" onClick={() => setImportStep(null)}>
              ×
            </button>
            <h3 className="display">
              {importStep === "file"
                ? "Import Leads"
                : importStep === "mapping"
                  ? "Map Lead Columns"
                  : "Import Complete"}
            </h3>
            {importStep === "file" && (
              <>
                <label className="file-drop">
                  {importHeaders.length
                    ? `${importRows.length} leads found — file selected`
                    : "Choose a CSV file"}
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={selectImportFile}
                  />
                </label>
                <small className="muted">
                  Select a file, then continue to map its columns.
                </small>
                {importHeaders.length > 0 && (
                  <button
                    className="primary"
                    onClick={() => setImportStep("mapping")}
                  >
                    Continue
                  </button>
                )}
              </>
            )}
            {importStep === "mapping" && (
              <>
                <p className="muted">
                  Map your CSV headers to Vectrace lead fields. Company and
                  phone are required.
                </p>
                <div className="mapping-grid">
                  {[
                    ["company", "Company Name *"],
                    ["phone", "Phone Number *"],
                    ["website", "Website"],
                    ["address", "Address"],
                    ["city", "City"],
                    ["state", "State"],
                    ["zipcode", "Zipcode"],
                    ["country", "Country"],
                    ["contactName", "Contact Person"],
                    ["email", "Contact Email (optional)"],
                  ].map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <select
                        value={mapping[field] || ""}
                        onChange={(e) =>
                          setMapping((current) => ({
                            ...current,
                            [field]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Do not import</option>
                        {importHeaders.map((header) => (
                          <option key={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={!mapping.company || !mapping.phone}
                  onClick={runImport}
                >
                  Import Leads
                </button>
              </>
            )}
            {importStep === "result" && (
              <>
                <div className="import-result">
                  <strong>{importResult?.added ?? 0}</strong>
                  <span>Leads imported</span>
                  <strong>{importResult?.skipped ?? 0}</strong>
                  <span>Duplicates / skipped</span>
                  <strong>
                    {(importResult?.added ?? 0) + (importResult?.skipped ?? 0)}
                  </strong>
                  <span>Total rows</span>
                </div>
                <button className="primary" onClick={() => setImportStep(null)}>
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {selected && (
        <LeadDrawer
          lead={selected}
          token={token}
          initialTab={selectedTab}
          close={() => {
            setSelected(null);
            setSelectedTab("Company Info");
          }}
          refresh={() => {
            refresh();
          }}
        />
      )}
    </>
  );
}

function Opportunities({
  leads,
  token,
  refresh,
  onNewOpportunity,
  initialLeadId,
  onOpportunityOpened,
}: {
  leads: Lead[];
  token: string;
  refresh: () => void;
  onNewOpportunity: (lead?: Lead) => void;
  initialLeadId?: string | null;
  onOpportunityOpened?: () => void;
}) {
  const [selected, setSelected] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLeadId, setNewLeadId] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<number | null>(null);
  const [caller, setCaller] = useState("All Callers");
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  // Preserve the opened opportunity after a stage, POC, or trial update.
  useEffect(() => {
    if (!selected) return;
    const updated = leads.find((lead) => lead.id === selected.id);
    if (updated) setSelected(updated);
  }, [leads, selected?.id]);
  useEffect(() => {
    const lead = initialLeadId
      ? leads.find((item) => item.id === initialLeadId)
      : undefined;
    if (lead?.opportunity) {
      setSelected(lead);
      onOpportunityOpened?.();
    }
  }, [initialLeadId, leads, onOpportunityOpened]);
  const opps = leads
    .filter((l) => l.opportunity)
    .filter((l) => stage === null || l.stage === stage)
    .filter((l) => caller === "All Callers" || l.owner === caller)
    .filter((l) => !addedFrom || l.createdAt >= addedFrom)
    .filter((l) => !addedTo || l.createdAt.slice(0, 10) <= addedTo)
    .filter(
      (l) =>
        !query ||
        `${l.company} ${l.contactName} ${l.owner}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const createOpportunity = async () => {
    const lead = leads.find((item) => item.id === newLeadId);
    if (!lead) return;
    const opportunity = {
      connected: false,
      createdAt: new Date().toISOString(),
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
    await api(`/leads/${lead.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ hot: false, opportunity }),
    });
    setCreating(false);
    setNewLeadId("");
    setSelected({ ...lead, hot: false, opportunity, stage: 1 });
    refresh();
  };
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Opportunities</h1>
          <p className="muted">
            The whole team’s pipeline, staged from first call to a paid, repeat
            client.
          </p>
        </div>
        <div className="opportunity-header-actions">
          <input
            className="search"
            placeholder="Search opportunities..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="primary" onClick={() => onNewOpportunity()}>
            <Plus size={15} /> Create New Opportunity
          </button>
        </div>
      </header>
      <div className="stage-cards">
        {[1, 2, 3, 4, 5].map((stageNumber) => (
          <button
            className="stage-card-button"
            key={stageNumber}
            onClick={() => setStage(stage === stageNumber ? null : stageNumber)}
          >
            <SectionCard title={`Stage ${stageNumber}`}>
              <strong className="display">
                {opps.filter((l) => l.stage === stageNumber).length}
              </strong>
              <small>
                {opportunityStages[stageNumber - 1].label}
              </small>
            </SectionCard>
          </button>
        ))}
      </div>
      <div className="opportunity-filters">
        <label>
          Stage
          <select
            value={stage ?? ""}
            onChange={(e) =>
              setStage(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">All stages</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Stage {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Caller
          <select value={caller} onChange={(e) => setCaller(e.target.value)}>
            <option>All Callers</option>
            {[...new Set(leads.map((l) => l.owner))]
              .filter(Boolean)
              .map((name) => (
                <option key={name}>{name}</option>
              ))}
          </select>
        </label>
        <label>
          Added from
          <input
            type="date"
            value={addedFrom}
            onChange={(e) => setAddedFrom(e.target.value)}
          />
        </label>
        <label>
          Added to
          <input
            type="date"
            value={addedTo}
            onChange={(e) => setAddedTo(e.target.value)}
          />
        </label>
      </div>
      <div className="table opportunity-table">
        <div className="opportunity-head">
          <span>Company</span>
          <span>Stage</span>
          <span>POC</span>
          <span>Trial</span>
          <span>City / State</span>
          <span>Assigned By</span>
          <span>Assigned To</span>
          <span>Assign Date</span>
          <span>Opportunity Created</span>
          <span />
        </div>
        {opps.map((l) => (
          <button
            className="opportunity-row"
            key={l.id}
            onClick={() => setSelected(l)}
          >
            <strong>{l.company}</strong>
            <Badge text={`Stage ${l.stage}`} />
            <span>{l.contactName || "Not obtained"}</span>
            <span
              className={
                (l.opportunity as any)?.trial?.given ? "trial-given" : ""
              }
            >
              {(l.opportunity as any)?.trial?.given ? "Given" : "Pending"}
            </span>
            <span>
              {[l.city, l.state || l.country].filter(Boolean).join(", ") ||
                "Not added"}
            </span>
            <span>{l.assignedBy || "—"}</span>
            <span>{l.owner || "Unassigned"}</span>
            <span>
              {l.assignedAt
                ? new Date(l.assignedAt).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })
                : "—"}
            </span>
            <span>
              {(l.opportunity as any)?.createdAt
                ? new Date((l.opportunity as any).createdAt).toLocaleString(
                    "en-US",
                    { dateStyle: "medium", timeStyle: "short" },
                  )
                : "—"}
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
        {!opps.length && (
          <Empty text="No opportunities yet — log the first call against a lead in Leads and it shows up here automatically." />
        )}
      </div>
      {selected && (
        <LeadDrawer
          lead={selected}
          token={token}
          initialTab="Opportunity"
          close={() => setSelected(null)}
          refresh={() => {
            refresh();
          }}
        />
      )}
      {creating && (
        <div className="modal-backdrop">
          <div className="quick-modal opportunity-create-modal">
            <button className="modal-close" onClick={() => setCreating(false)}>
              ×
            </button>
            <h3 className="display">Create New Opportunity</h3>
            <p className="muted">
              Select a lead to open its Stage 1 opportunity pipeline.
            </p>
            <label className="field">
              Lead
              <select
                value={newLeadId}
                onChange={(event) => setNewLeadId(event.target.value)}
              >
                <option value="">Select a lead</option>
                {leads
                  .filter((lead) => !lead.opportunity)
                  .map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.company} — {lead.contactName || "No contact yet"}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!newLeadId}
              onClick={createOpportunity}
            >
              Create Opportunity
            </button>
          </div>
        </div>
      )}
    </>
  );
}

type Client = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  type: string;
  createdAt: string;
  billingMonth: string;
  projects: Array<{
    id: string;
    name: string;
    service: string;
    designer: string;
    status: string;
    startDate: string;
    attachments?: string[];
    designerAttachments?: string[];
  }>;
  totalAmount: number;
  paid: number;
  due: string;
  payments: Array<{ date: string; amount: number; originalAmount?: number; currency?: string; convertedPKR?: number; note?: string }>;
};
type Assignment = {
  id: string;
  projectName: string;
  logoName?: string;
  projectType: string;
  designerName: string;
  clientCompany?: string;
  contactName?: string;
  assignedDate: string;
  payment: number;
  paid: number;
  description: string;
  attachmentName?: string | null;
  attachedFiles?: string[];
  deliveries?: Array<{ name: string; path: string; uploadedAt: string }>;
  deliveryNote?: string;
  status?: "Not Started" | "In Progress" | "Delivered";
  emailWarning?: string;
};
type Designer = {
  id: string;
  name: string;
  email: string;
  address?: string;
  bankAccount?: string;
  phone?: string;
};
function ClientsView({ token }: { token: string }) {
  const [clients, setClients] = useState<Client[]>([]),
    [adding, setAdding] = useState(false),
    [selectedClient, setSelectedClient] = useState<Client | null>(null),
    [selectedProject, setSelectedProject] = useState<Client["projects"][number] | null>(null),
    [projectAssignments, setProjectAssignments] = useState<Assignment[]>([]),
    [orderClient, setOrderClient] = useState<Client | null>(null),
    [orderType, setOrderType] = useState<"Unpaid" | "Paid">("Unpaid"),
    [orderCurrency, setOrderCurrency] = useState<"USD" | "CAD" | "EUR">("USD"),
    [orderConversionRate, setOrderConversionRate] = useState("1"),
    [orderFiles, setOrderFiles] = useState<string[]>([]),
    [clientTab, setClientTab] = useState("Client Info"),
    [projectRange, setProjectRange] = useState<DateRange>("All Time"),
    [projectFrom, setProjectFrom] = useState(""),
    [projectTo, setProjectTo] = useState(""),
    [paymentRange, setPaymentRange] = useState<DateRange>("All Time"),
    [paymentFrom, setPaymentFrom] = useState(""),
    [paymentTo, setPaymentTo] = useState(""),
    [invoicePeriod, setInvoicePeriod] = useState<"Weekly" | "Monthly">("Monthly"),
    [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10)),
    [clientType, setClientType] = useState<"Unpaid" | "Paid">("Unpaid"),
    [clientCurrency, setClientCurrency] = useState<"USD" | "CAD" | "EUR">("USD"),
    [clientConversionRate, setClientConversionRate] = useState("1"),
    [clientFiles, setClientFiles] = useState<string[]>([]),
    [form, setForm] = useState({
      company: "",
      contact: "",
      email: "",
      phone: "",
      projectName: "",
      service: "Digitizing",
      startDate: new Date().toISOString().slice(0, 10),
      amount: "",
    }),
    [orderForm, setOrderForm] = useState({
      projectName: "",
      service: "Digitizing",
      startDate: new Date().toISOString().slice(0, 10),
      amount: "",
    });
  useEffect(() => {
    api<Client[]>("/clients", token)
      .then(setClients)
      .catch(() => {});
    api<Assignment[]>("/assignments", token)
      .then(setProjectAssignments)
      .catch(() => {});
  }, [token]);
  const defaultUsdRate = (currency: "USD" | "CAD" | "EUR") => ({ USD: "1", CAD: "0.73", EUR: "1.09" }[currency]);
  const toUSD = (amount: string, rate: string) => Number(amount || 0) * Number(rate || 0);
  const invoiceWindow = () => {
    const date = new Date(`${invoiceDate}T12:00:00`);
    const start = new Date(date);
    if (invoicePeriod === "Weekly") start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    else start.setDate(1);
    const end = new Date(start);
    if (invoicePeriod === "Weekly") end.setDate(start.getDate() + 6);
    else end.setMonth(start.getMonth() + 1, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  };
  const downloadClientInvoice = (client: Client) => {
    const { start, end } = invoiceWindow();
    const payments = client.payments.filter((payment) => payment.date >= start && payment.date <= end);
    const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const lines = ["VECTRACE EMB - CLIENT INVOICE", `Client: ${client.company}`, `Contact: ${client.contact}`, `Invoice period: ${start} to ${end} (${invoicePeriod})`, "", "Payments received:", ...(payments.length ? payments.map((payment) => `${payment.date}  -  USD ${payment.amount.toFixed(2)}`) : ["No payments received in this period."]), "", `Total received: USD ${total.toFixed(2)}`, `Client balance: USD ${Math.max(0, client.totalAmount - client.paid).toFixed(2)}`, "Thank you for your business."];
    downloadPdf(`${client.company.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${invoicePeriod.toLowerCase()}-invoice.pdf`, lines);
  };
  const deleteClient = async (client: Client) => {
    if (!window.confirm(`Delete ${client.company}? This permanently removes its client details, projects, and payments from CRM.`)) return;
    try {
      await api(`/clients/${client.id}`, token, { method: "DELETE" });
      setClients((items) => items.filter((item) => item.id !== client.id));
      setSelectedClient(null);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not delete this client."); }
  };
  const addClient = async () => {
    const projects = form.projectName
      ? [
          {
            id: crypto.randomUUID(),
            name: form.projectName,
            service: form.service,
            designer: "Unassigned",
            status: "Not Started",
            startDate: form.startDate,
            attachments: clientFiles,
          },
        ]
      : [];
    const client = await api<Client>("/clients", token, {
      method: "POST",
      body: JSON.stringify({
        company: form.company,
        contact: form.contact,
        email: form.email,
        phone: form.phone,
        type: clientType,
        projects,
        totalAmount: toUSD(form.amount, clientConversionRate),
        due: `USD ${toUSD(form.amount, clientConversionRate).toFixed(2)}`,
      }),
    });
    setClients((items) => [...items, client]);
    setAdding(false);
    setClientFiles([]);
    setForm({
      company: "",
      contact: "",
      email: "",
      phone: "",
      projectName: "",
      service: "Digitizing",
      startDate: new Date().toISOString().slice(0, 10),
      amount: "",
    });
  };
  const addOrder = async () => {
    if (!orderClient || !orderForm.projectName || !orderForm.amount) return;
    const updated = await api<Client>(
      `/clients/${orderClient.id}/orders`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          projectName: orderForm.projectName,
          amount: toUSD(orderForm.amount, orderConversionRate),
          service: orderForm.service,
          startDate: orderForm.startDate,
          attachments: orderFiles,
          type: orderType,
        }),
      },
    );
    setClients((items) =>
      items.map((item) => (item.id === orderClient.id ? updated : item)),
    );
    setSelectedClient(updated);
    setClientTab("Projects");
    setOrderClient(null);
    setOrderFiles([]);
    setOrderForm({
      projectName: "",
      service: "Digitizing",
      startDate: new Date().toISOString().slice(0, 10),
      amount: "",
    });
  };
  const visibleProjects =
    selectedClient?.projects.filter(
      (project) =>
        matchesDateRange(project.startDate, projectRange) &&
        (!projectFrom || project.startDate >= projectFrom) &&
        (!projectTo || project.startDate <= projectTo),
    ) ?? [];
  const visiblePayments =
    selectedClient?.payments.filter(
      (payment) =>
        matchesDateRange(payment.date, paymentRange) &&
        (!paymentFrom || payment.date >= paymentFrom) &&
        (!paymentTo || payment.date <= paymentTo),
    ) ?? [];
  const visiblePaid = visiblePayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const addPayment = async (client: Client) => {
    const amount = Number(window.prompt("Payment amount in USD"));
    if (!amount) return;
    const updated = await api<Client>(`/clients/${client.id}/payments`, token, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    setClients((items) =>
      items.map((item) => (item.id === client.id ? updated : item)),
    );
  };
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Clients</h1>
          <p className="muted">
            Won leads convert here automatically, with full history preserved.
          </p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add Client
        </button>
      </header>
      <div className="client-grid">
        {clients.map((c) => (
          <div
            className="client-card-click"
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedClient(c)}
          >
            <SectionCard title={c.company} right={<Badge text={c.type} />}>
              <p>{c.contact}</p>
              <p className="muted">
                USD {c.paid} paid of USD {c.totalAmount} · {c.due}
              </p>
              {c.projects.map((p) => (
                <div className="project-row" key={p.id}>
                  <span>
                    {p.name}
                    <small>
                      {p.service} · {p.designer}
                    </small>
                  </span>
                  <Badge text={p.status} />
                </div>
              ))}
            </SectionCard>
          </div>
        ))}
      </div>
      {selectedClient && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedClient(null)}
        >
          <aside
            className="client-detail-panel"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <button
                className="drawer-close"
                onClick={() => setSelectedClient(null)}
              >
                ← Close
              </button>
              <button
                className="primary"
                onClick={() => setOrderClient(selectedClient)}
              >
                <Plus size={15} /> Add Order
              </button>
              <button className="delete-lead" onClick={() => deleteClient(selectedClient)}>Delete Client</button>
            </header>
            <div className="client-detail-title">
              <h2 className="display">{selectedClient.company}</h2>
              <Badge text={selectedClient.type} />
            </div>
            <p className="muted">
              {selectedClient.contact} ·{" "}
              {selectedClient.email || "No email provided"}
            </p>
            <Tabs
              tabs={["Client Info", "Projects", "Client Payments", "Timeline"]}
              active={clientTab}
              onChange={setClientTab}
            />
            {clientTab === "Client Info" && (
              <div className="drawer-section">
                <div className="lead-info-card">
                  <Building2 size={15} />
                  <span>
                    <small>Company Name</small>
                    <strong>{selectedClient.company}</strong>
                  </span>
                </div>
                <div className="lead-info-card">
                  <Users size={15} />
                  <span>
                    <small>Contact Person</small>
                    <strong>{selectedClient.contact}</strong>
                  </span>
                </div>
                <div className="lead-info-card">
                  <Bell size={15} />
                  <span>
                    <small>Email</small>
                    <strong>{selectedClient.email || "Not provided"}</strong>
                  </span>
                </div>
                <div className="lead-info-card">
                  <Phone size={15} />
                  <span>
                    <small>Phone</small>
                    <strong>{selectedClient.phone || "Not provided"}</strong>
                  </span>
                </div>
              </div>
            )}
            {clientTab === "Projects" && (
              <div className="client-tab-content">
                <div className="client-date-filters">
                  <DateRangeFilter
                    value={projectRange}
                    onChange={setProjectRange}
                    label="Filter by Start Date"
                  />
                  <label className="field">
                    <span>From</span>
                    <input
                      type="date"
                      value={projectFrom}
                      onChange={(event) => setProjectFrom(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input
                      type="date"
                      value={projectTo}
                      onChange={(event) => setProjectTo(event.target.value)}
                    />
                  </label>
                </div>
                {visibleProjects.length ? (
                  visibleProjects.map((project) => (
                    <button
                      type="button"
                      className="project-row client-project-row client-project-open"
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                    >
                      <span>
                        <b>{project.name}</b>
                        <small>
                          {project.service} · {project.designer} · started{" "}
                          {new Date(project.startDate).toLocaleDateString(
                            "en-US",
                            { dateStyle: "medium" },
                          )}
                        </small>
                      </span>
                      <span className="client-project-actions"><Badge text={project.status} /><span className="project-open-hint">Open</span></span>
                    </button>
                  ))
                ) : (
                  <Empty text="No projects in this date range." />
                )}
              </div>
            )}
            {clientTab === "Client Payments" && (
              <div className="client-tab-content">
                <div className="client-date-filters">
                  <DateRangeFilter
                    value={paymentRange}
                    onChange={setPaymentRange}
                    label="Filter Payments"
                  />
                  <label className="field">
                    <span>From</span>
                    <input
                      type="date"
                      value={paymentFrom}
                      onChange={(event) => setPaymentFrom(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input
                      type="date"
                      value={paymentTo}
                      onChange={(event) => setPaymentTo(event.target.value)}
                    />
                  </label>
                </div>
                <section className="invoice-controls">
                  <div>
                    <b>Download Invoice</b>
                    <small>Available only to Admin. Select a weekly or monthly payment period.</small>
                  </div>
                  <label className="field"><span>Invoice Period</span><select value={invoicePeriod} onChange={(event) => setInvoicePeriod(event.target.value as "Weekly" | "Monthly")}><option>Weekly</option><option>Monthly</option></select></label>
                  <label className="field"><span>Period Date</span><input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
                  <button className="outline-button" onClick={() => downloadClientInvoice(selectedClient)}><Download size={14} /> Download PDF</button>
                </section>
                <section className="billing-card">
                  <small>Payment Period</small>
                  <h3>{paymentRange}</h3>
                  <p>Payment totals update according to the selected period.</p>
                </section>
                <div className="payment-summary">
                  <div>
                    <small>Total Orders</small>
                    <b>${selectedClient.totalAmount}</b>
                  </div>
                  <div>
                    <small>Paid</small>
                    <b>${visiblePaid}</b>
                  </div>
                  <div>
                    <small>Balance</small>
                    <b>
                      ${Math.max(0, selectedClient.totalAmount - visiblePaid)}
                    </b>
                  </div>
                </div>
                {visiblePayments.length ? (
                  visiblePayments.map((payment, index) => (
                    <div className="payment-row" key={index}>
                      <span>
                        {new Date(payment.date).toLocaleDateString("en-US", {
                          dateStyle: "medium",
                        })}
                      </span>
                      <b>${payment.amount}</b>
                    </div>
                  ))
                ) : (
                  <Empty text="No payments in this date range." />
                )}
              </div>
            )}
            {clientTab === "Timeline" && (
              <div className="client-tab-content">
                <p className="timeline-row">
                  Client created{" "}
                  {new Date(selectedClient.createdAt).toLocaleDateString(
                    "en-US",
                    { dateStyle: "medium" },
                  )}
                </p>
                {selectedClient.projects.map((project) => (
                  <p className="timeline-row" key={project.id}>
                    Project added: {project.name}
                  </p>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
      {selectedProject && (() => {
        const matchingAssignments = projectAssignments.filter((assignment) => assignment.clientCompany === selectedClient?.company && assignment.projectName === selectedProject.name);
        const deliveredPaths = uniqueAttachmentPaths([...(selectedProject.designerAttachments ?? []), ...matchingAssignments.flatMap((assignment) => assignment.deliveries?.map((file) => file.path) ?? [])]);
        const clientPaths = uniqueAttachmentPaths(selectedProject.attachments ?? []).filter((path) => !deliveredPaths.some((delivered) => attachmentLabel(delivered).toLocaleLowerCase() === attachmentLabel(path).toLocaleLowerCase()));
        return <Modal title={selectedProject.name} onClose={() => setSelectedProject(null)}>
          <div className="client-project-detail">
            <div className="client-project-detail-head"><div><small>Project Type</small><b>{selectedProject.service}</b></div><Badge text={selectedProject.status} /></div>
            <p className="muted">Assigned to {selectedProject.designer} · started {new Date(selectedProject.startDate).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
            <section><h4>Client Files</h4>{clientPaths.length ? <div className="project-file-list">{clientPaths.map((file) => file.startsWith("/files/") ? <button key={file} onClick={() => downloadAttachment(file, token).catch(() => window.alert("Could not download this file"))}><Paperclip size={14} /> {attachmentLabel(file)}</button> : <span key={file}><Paperclip size={14} /> {attachmentLabel(file)} <small>File needs re-uploading</small></span>)}</div> : <p className="muted">No client files attached.</p>}</section>
            <section><h4>Designer Delivered Files</h4>{deliveredPaths.length ? <div className="project-file-list">{deliveredPaths.map((file) => <button key={file} onClick={() => downloadAttachment(file, token).catch(() => window.alert("Could not download this file"))}><Paperclip size={14} /> {attachmentLabel(file)}</button>)}</div> : <p className="muted">No files have been delivered by the designer.</p>}</section>
          </div>
        </Modal>;
      })()}
      {adding && (
        <div className="modal-backdrop">
          <div className="quick-modal client-modal">
            <button className="modal-close" onClick={() => setAdding(false)}>
              ×
            </button>
            <h3 className="display">Add Client</h3>
            {[
              ["company", "Company Name"],
              ["contact", "Contact Person"],
              ["email", "Email"],
              ["phone", "Phone"],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      [key]: e.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <label className="field">
              Client Type
              <div className="client-type-toggle">
                <button
                  className={clientType === "Unpaid" ? "active" : ""}
                  onClick={() => setClientType("Unpaid")}
                >
                  Unpaid (Free sample)
                </button>
                <button
                  className={clientType === "Paid" ? "active" : ""}
                  onClick={() => setClientType("Paid")}
                >
                  Paid
                </button>
              </div>
            </label>
            <div className="paid-client-fields">
              <label className="field">
                Project Type
                <select
                  value={form.service}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      service: e.target.value,
                    }))
                  }
                >
                  <option>Digitizing</option>
                  <option>Embroidery</option>
                  <option>Vector Art</option>
                  <option>Custom Patches</option>
                </select>
              </label>
              <label className="field">
                Project Name
                <input
                  value={form.projectName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      projectName: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Start Date
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      startDate: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                {clientType === "Unpaid" ? "Quoted Rate" : "Charge"}
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      amount: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Currency
                <select value={clientCurrency} onChange={(event) => { const currency = event.target.value as "USD" | "CAD" | "EUR"; setClientCurrency(currency); setClientConversionRate(defaultUsdRate(currency)); }}><option>USD</option><option>CAD</option><option>EUR</option></select>
              </label>
              <div className="currency-preview">{clientCurrency} {form.amount || "0"} <span>≈</span> <b>USD {toUSD(form.amount, clientConversionRate).toFixed(2)}</b><label>1 {clientCurrency} = <input type="number" step="0.01" value={clientConversionRate} onChange={(event) => setClientConversionRate(event.target.value)} /> USD</label><small>Finance uses USD × 278 PKR</small></div>
            </div>
            <AttachmentRows
              files={clientFiles}
              onChoose={(file) =>
                setClientFiles((files) => [file.name, ...files.slice(1)])
              }
              onAdd={(files) =>
                setClientFiles((current) => [
                  ...current,
                  ...files.map((file) => file.name),
                ])
              }
            />
            <button
              className="primary"
              disabled={!form.company || !form.contact}
              onClick={addClient}
            >
              Add Client
            </button>
          </div>
        </div>
      )}
      {orderClient && (
        <div className="modal-backdrop">
          <div className="quick-modal client-modal">
            <button
              className="modal-close"
              onClick={() => setOrderClient(null)}
            >
              ×
            </button>
            <h3>Add Order — {orderClient.company}</h3>
            <label className="field">
              Order Type
              <div className="client-type-toggle">
                <button
                  className={orderType === "Unpaid" ? "active" : ""}
                  onClick={() => setOrderType("Unpaid")}
                >
                  Unpaid
                </button>
                <button
                  className={orderType === "Paid" ? "active" : ""}
                  onClick={() => setOrderType("Paid")}
                >
                  Paid
                </button>
              </div>
            </label>
            <label className="field">
              Project Type
              <select
                value={orderForm.service}
                onChange={(e) =>
                  setOrderForm((v) => ({ ...v, service: e.target.value }))
                }
              >
                <option>Digitizing</option>
                <option>Embroidery</option>
                <option>Vector Art</option>
                <option>Custom Patches</option>
              </select>
            </label>
            <label className="field">
              Project Name
              <input
                value={orderForm.projectName}
                onChange={(e) =>
                  setOrderForm((v) => ({ ...v, projectName: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Start Date
              <input
                type="date"
                value={orderForm.startDate}
                onChange={(e) =>
                  setOrderForm((v) => ({ ...v, startDate: e.target.value }))
                }
              />
            </label>
            <label className="field">
              {orderType === "Unpaid" ? "Quoted Rate" : "Charge"}
              <input
                type="number"
                value={orderForm.amount}
                onChange={(e) =>
                  setOrderForm((v) => ({ ...v, amount: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Currency
              <select value={orderCurrency} onChange={(event) => { const currency = event.target.value as "USD" | "CAD" | "EUR"; setOrderCurrency(currency); setOrderConversionRate(defaultUsdRate(currency)); }}><option>USD</option><option>CAD</option><option>EUR</option></select>
            </label>
            <div className="currency-preview">{orderCurrency} {orderForm.amount || "0"} <span>≈</span> <b>USD {toUSD(orderForm.amount, orderConversionRate).toFixed(2)}</b><label>1 {orderCurrency} = <input type="number" step="0.01" value={orderConversionRate} onChange={(event) => setOrderConversionRate(event.target.value)} /> USD</label><small>Finance uses USD × 278 PKR</small></div>
            <AttachmentRows
              files={orderFiles}
              onChoose={(file) =>
                setOrderFiles((files) => [file.name, ...files.slice(1)])
              }
              onAdd={(files) =>
                setOrderFiles((current) => [
                  ...current,
                  ...files.map((file) => file.name),
                ])
              }
            />
            <button
              className="primary"
              disabled={!orderForm.projectName || !orderForm.amount}
              onClick={addOrder}
            >
              Add Order
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function DesignersView({ token }: { token: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  useEffect(() => {
    api<Assignment[]>("/assignments", token)
      .then(setAssignments)
      .catch(() => {});
  }, [token]);
  const assign = async () => {
    const designerName = window.prompt("Designer name");
    const projectName = window.prompt("Project name");
    const payment = Number(window.prompt("Agreed payment in PKR"));
    if (!designerName || !projectName || !payment) return;
    const item = await api<Assignment>("/assignments", token, {
      method: "POST",
      body: JSON.stringify({ designerName, projectName, payment }),
    });
    setAssignments((items) => [...items, item]);
  };
  const grouped = assignments.reduce<Record<string, Assignment[]>>((all, a) => {
    (all[a.designerName] ??= []).push(a);
    return all;
  }, {});
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Designers</h1>
          <p className="muted">Project assignments and PKR payment tracking.</p>
        </div>
        <button className="primary" onClick={assign}>
          <Plus size={16} /> Assign Designer
        </button>
      </header>
      <div className="client-grid">
        {Object.entries(grouped).map(([name, rows]) => (
          <SectionCard key={name} title={name}>
            <p className="muted">{rows.length} assignment(s)</p>
            {rows.map((a) => (
              <div className="project-row" key={a.id}>
                <span>
                  {a.projectName}
                  <small>
                    {a.clientCompany} · PKR {a.paid} / PKR {a.payment}
                  </small>
                </span>
                <Badge text={a.paid >= a.payment ? "Paid" : "Unpaid"} />
                {a.paid < a.payment && (
                  <button
                    className="demo-button"
                    onClick={async () => {
                      const updated = await api<Assignment>(
                        `/assignments/${a.id}/mark-paid`,
                        token,
                        { method: "POST", body: JSON.stringify({}) },
                      );
                      setAssignments((items) =>
                        items.map((item) =>
                          item.id === a.id ? updated : item,
                        ),
                      );
                    }}
                  >
                    Mark Paid
                  </button>
                )}
              </div>
            ))}
          </SectionCard>
        ))}
      </div>
    </>
  );
}
function DesignersWorkspace({ token }: { token: string }) {
  const [rows, setRows] = useState<Assignment[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [designers, setDesigners] = useState<Designer[]>([]),
    [selectedDesigner, setSelectedDesigner] = useState<Designer | null>(null),
    [designerDetailTab, setDesignerDetailTab] = useState("Designer Info"),
    [range, setRange] = useState<DateRange>("All Time"),
    [open, setOpen] = useState<"assign" | "designer" | null>(null),
    [designerMode, setDesignerMode] = useState<"existing" | "new">("existing"),
    [form, setForm] = useState({
      clientCompany: "",
      projectType: "Digitizing",
      projectName: "",
      logoName: "",
      description: "",
      assignedDate: new Date().toISOString().slice(0, 10),
      designerName: "",
      payment: "",
    }),
    [newDesigner, setNewDesigner] = useState({
      name: "",
      email: "",
      address: "",
      bankAccount: "",
      phone: "",
    }),
    [assignmentFiles, setAssignmentFiles] = useState<string[]>([]);
  const [selectedClientProjectId, setSelectedClientProjectId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const load = () =>
    api<Assignment[]>(
      `/assignments?assignedDateRange=${encodeURIComponent(range)}`,
      token,
    ).then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, [range, token]);
  useEffect(() => {
    api<Client[]>("/clients", token)
      .then(setClients)
      .catch(() => {});
    api<Designer[]>("/designers", token)
      .then(setDesigners)
      .catch(() => {});
  }, [token]);
  const assign = async () => {
    setAssignError("");
    if (!form.clientCompany || !form.projectName.trim() || Number(form.payment) <= 0) {
      setAssignError("Select a client, enter a project name, and add a payment greater than zero.");
      return;
    }
    if (designerMode === "existing" && !form.designerName) {
      setAssignError("Select a designer first.");
      return;
    }
    if (designerMode === "new" && (!newDesigner.name || !newDesigner.email || !newDesigner.phone || !newDesigner.address || !newDesigner.bankAccount)) {
      setAssignError("Complete all new designer details before assigning the project.");
      return;
    }
    setAssigning(true);
    try {
      let designerName = form.designerName;
      let designerEmail = designers.find((designer) => designer.name === designerName)?.email ?? "";
      if (designerMode === "new") {
        const designer = await api<Designer>("/designers", token, {
          method: "POST",
          body: JSON.stringify(newDesigner),
        });
        setDesigners((items) => [...items, designer]);
        designerName = designer.name;
        designerEmail = designer.email;
      }
      const item = await api<Assignment>("/assignments", token, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          designerName,
          designerEmail,
          payment: Number(form.payment),
          attachmentName: assignmentFiles[0] ?? null,
          attachedFiles: assignmentFiles,
        }),
      });
      setRows((items) => [item, ...items]);
      setAssignmentFiles([]);
      setOpen(null);
      if (item.emailWarning) window.alert(item.emailWarning);
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : "Could not assign this project.");
    } finally {
      setAssigning(false);
    }
  };
  const markPaid = async (id: string) => {
    try {
      const updated = await api<Assignment>(
        `/assignments/${id}/mark-paid`,
        token,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRows((items) =>
        items.map((item) => (item.id === id ? updated : item)),
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not mark this assignment as paid.");
    }
  };
  const deleteDesigner = async (designer: Designer) => {
    if (!window.confirm(`Delete ${designer.name}? Their CRM login will be removed. Previous project history stays for records.`)) return;
    try {
      await api(`/designers/${designer.id}`, token, { method: "DELETE" });
      setDesigners((items) => items.filter((item) => item.id !== designer.id));
      setSelectedDesigner(null);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not delete this designer."); }
  };
  const addDesigner = async () => {
    const item = await api<Designer>("/designers", token, {
      method: "POST",
      body: JSON.stringify(newDesigner),
    });
    setDesigners((items) => [...items, item]);
    setOpen(null);
  };
  const uploadAssignmentFile = async (file: File) => {
    const uploaded = await api<{ path: string }>("/files", token, {
      method: "POST",
      body: JSON.stringify({ name: file.name, data: await fileData(file) }),
    });
    return uploaded.path;
  };
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Designers</h1>
          <p className="muted">
            Assign projects, track payment, and send the brief straight from
            here.
          </p>
        </div>
        <button className="primary" onClick={() => setOpen("assign")}>
          <Plus size={16} /> Assign Project
        </button>
      </header>
      <div className="designer-filter">
        <DateRangeFilter
          value={range}
          onChange={setRange}
          label="Filter by Assigned Date"
        />
      </div>
      <div className="designer-summary-grid">
        {designers.map((designer) => {
          const items = rows.filter(
            (item) => item.designerName === designer.name,
          );
          const total = items.reduce((sum, item) => sum + item.payment, 0);
          const due = items.reduce(
            (sum, item) => sum + item.payment - item.paid,
            0,
          );
          return (
            <button
              className="designer-summary-card designer-card-click"
              key={designer.id}
              onClick={() => {
                setDesignerDetailTab("Designer Info");
                setSelectedDesigner(designer);
              }}
            >
              <span>
                <b>{designer.name}</b>
                <small>{designer.email}</small>
                <em className={due ? "pending" : "paid"}>
                  {due ? `Rs ${due.toLocaleString()} pending` : "Fully paid"}
                </em>
              </span>
              <span>
                <b>Rs {total.toLocaleString()}</b>
                <small>{items.length} assigned</small>
              </span>
            </button>
          );
        })}
      </div>
      <SectionCard
        title="Recent Assignments"
        right={
          <button className="demo-button" onClick={() => setOpen("designer")}>
            + New Designer
          </button>
        }
      >
        {rows.map((item) => (
          <div className="designer-assignment-row" key={item.id}>
            <span>
              <b>{item.projectName}</b>
              <small>
                {item.clientCompany} · {item.projectType} · {item.designerName}{" "}
                · assigned {item.assignedDate}
              </small>
            </span>
            <span>
              <b>Rs {item.payment.toLocaleString()}</b>
              <small className={item.paid >= item.payment ? "paid" : "pending"}>
                {item.paid >= item.payment
                  ? "Paid"
                  : `Rs ${item.payment - item.paid} due`}
              </small>
              {item.paid < item.payment && (
                <button
                  className="demo-button"
                  onClick={() => markPaid(item.id)}
                >
                  Mark Paid
                </button>
              )}
            </span>
          </div>
        ))}
      </SectionCard>
      {selectedDesigner && (() => {
        const items = rows.filter((item) => item.designerName === selectedDesigner.name);
        const total = items.reduce((sum, item) => sum + item.payment, 0);
        const paid = items.reduce((sum, item) => sum + item.paid, 0);
        return (
          <div className="modal-backdrop">
            <aside className="client-detail-panel designer-detail-panel">
              <header><button className="drawer-close" onClick={() => setSelectedDesigner(null)}>← Close</button><button className="primary" onClick={() => { setForm((current) => ({ ...current, designerName: selectedDesigner.name })); setDesignerMode("existing"); setSelectedDesigner(null); setOpen("assign"); }}><Plus size={14} /> Assign Project</button></header>
              <div className="client-detail-title"><h2 className="display">{selectedDesigner.name}</h2><Badge text={paid >= total ? "Fully paid" : "Payment pending"} /></div>
              <p className="muted">Designer profile, contact details, and assigned projects.</p>
              <button className="delete-lead" onClick={() => deleteDesigner(selectedDesigner)}>Delete Designer</button>
              <Tabs tabs={["Designer Info", "Assignments", "Payments"]} active={designerDetailTab} onChange={setDesignerDetailTab} />
              <div className="client-tab-content">
                {designerDetailTab === "Designer Info" && <div className="client-detail-grid">
                  <p><small>Email</small><b>{selectedDesigner.email}</b></p>
                  <p><small>Phone</small><b>{selectedDesigner.phone || "Not added"}</b></p>
                  <p><small>Address</small><b>{selectedDesigner.address || "Not added"}</b></p>
                  <p><small>Bank Account</small><b>{selectedDesigner.bankAccount || "Not added"}</b></p>
                </div>}
                {designerDetailTab === "Assignments" && <>{items.length ? items.map((item) => <div className="designer-assignment-row" key={item.id}><span><b>{item.projectName}</b><small>{item.clientCompany} · {item.projectType} · {item.assignedDate}</small></span><span><b>Rs {item.payment.toLocaleString()}</b><small className={item.paid >= item.payment ? "paid" : "pending"}>{item.paid >= item.payment ? "Paid" : `Rs ${item.payment - item.paid} due`}</small></span></div>) : <Empty text="No assignments yet." />}</>}
                {designerDetailTab === "Payments" && <><div className="payment-summary"><div><small>Total</small><b>Rs {total.toLocaleString()}</b></div><div><small>Paid</small><b>Rs {paid.toLocaleString()}</b></div><div><small>Balance</small><b>Rs {(total - paid).toLocaleString()}</b></div></div>{items.filter((item) => item.paid < item.payment).map((item) => <div className="designer-assignment-row" key={item.id}><span><b>{item.projectName}</b><small>Rs {item.payment - item.paid} pending</small></span><button className="demo-button" onClick={() => markPaid(item.id)}>Mark Paid</button></div>)}</>}
              </div>
            </aside>
          </div>
        );
      })()}
      {open === "assign" && (
        <div className="modal-backdrop">
          <div className="quick-modal designer-modal">
            <button className="modal-close" onClick={() => setOpen(null)}>
              ×
            </button>
            <h3>Assign Project to Designer</h3>
            <label className="field">
              Client
              <select
                value={form.clientCompany}
                onChange={(e) => {
                  setForm((v) => ({ ...v, clientCompany: e.target.value, projectName: "" }));
                  setSelectedClientProjectId("");
                  setAssignmentFiles([]);
                }}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id}>{client.company}</option>
                ))}
              </select>
            </label>
            {form.clientCompany && <label className="field">
              Client Project
              <select
                value={selectedClientProjectId}
                onChange={(e) => {
                  const project = clients.find((client) => client.company === form.clientCompany)?.projects.find((item) => item.id === e.target.value);
                  setSelectedClientProjectId(e.target.value);
                  if (project) {
                    setForm((value) => ({ ...value, projectName: project.name, projectType: project.service, assignedDate: project.startDate }));
                    setAssignmentFiles(project.attachments ?? []);
                  }
                }}
              >
                <option value="">Enter a new project below</option>
                {clients.find((client) => client.company === form.clientCompany)?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>}
            <label className="field">
              Project Type
              <select
                value={form.projectType}
                onChange={(e) =>
                  setForm((v) => ({ ...v, projectType: e.target.value }))
                }
              >
                <option>Digitizing</option>
                <option>Embroidery</option>
                <option>Vector Art</option>
                <option>Custom Patches</option>
              </select>
            </label>
            {[
              ["projectName", "Project Name"],
              ["logoName", "Logo Name"],
              ["description", "Project Description"],
              ["assignedDate", "Assigned Date"],
              ["payment", "Payment (PKR)"],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                {key === "description" ? (
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, description: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    type={
                      key === "assignedDate"
                        ? "date"
                        : key === "payment"
                          ? "number"
                          : "text"
                    }
                    value={form[key as keyof typeof form]}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
            <div className="designer-mode-toggle">
              <button
                type="button"
                className={designerMode === "existing" ? "active" : ""}
                onClick={() => setDesignerMode("existing")}
              >
                Existing Designer
              </button>
              <button
                type="button"
                className={designerMode === "new" ? "active" : ""}
                onClick={() => setDesignerMode("new")}
              >
                New Designer
              </button>
            </div>
            {designerMode === "existing" && (
              <label className="field">
                Designer
                <select
                  value={form.designerName}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, designerName: e.target.value }))
                  }
                >
                  <option value="">Select designer</option>
                  {designers.map((designer) => (
                    <option key={designer.id}>{designer.name}</option>
                  ))}
                </select>
              </label>
            )}
            {designerMode === "existing" &&
              form.designerName &&
              (() => {
                const designer = designers.find(
                  (item) => item.name === form.designerName,
                );
                return designer ? (
                  <div className="designer-details-preview">
                    <span>
                      <small>Email</small>
                      {designer.email}
                    </span>
                    <span>
                      <small>Phone</small>
                      {designer.phone || "Not added"}
                    </span>
                    <span>
                      <small>Address</small>
                      {designer.address || "Not added"}
                    </span>
                    <span>
                      <small>Bank Account</small>
                      {designer.bankAccount || "Not added"}
                    </span>
                  </div>
                ) : null;
              })()}
            {designerMode === "new" && (
              <div className="inline-new-designer">
                <label className="field">
                  Designer Full Name
                  <input
                    value={newDesigner.name}
                    onChange={(e) =>
                      setNewDesigner((v) => ({ ...v, name: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  Designer Email
                  <input
                    type="email"
                    value={newDesigner.email}
                    onChange={(e) =>
                      setNewDesigner((v) => ({ ...v, email: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  Phone Number
                  <input
                    value={newDesigner.phone}
                    onChange={(e) =>
                      setNewDesigner((v) => ({ ...v, phone: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  Address
                  <input
                    value={newDesigner.address}
                    onChange={(e) =>
                      setNewDesigner((v) => ({ ...v, address: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  Bank Account Number
                  <input
                    value={newDesigner.bankAccount}
                    onChange={(e) =>
                      setNewDesigner((v) => ({
                        ...v,
                        bankAccount: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            )}
            <div className="assignment-attachments">
              <span className="field-label">
                Attachments (brief, mockup, etc.)
              </span>
              <label className="attachment-dropzone">
                <Paperclip size={15} />
                <span>{assignmentFiles[0] ? attachmentLabel(assignmentFiles[0]) : "Choose a file"}</span>
                <input
                  type="file"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      const uploaded = await uploadAssignmentFile(file);
                      setAssignmentFiles((files) => [
                        uploaded,
                        ...files.slice(1),
                      ]);
                    }
                  }}
                />
              </label>
              <label className="attachment-dropzone">
                <Paperclip size={15} />
                <span>
                  {assignmentFiles.length > 1
                    ? `${assignmentFiles.length - 1} additional file${assignmentFiles.length === 2 ? "" : "s"} selected`
                    : "Add another file (optional)"}
                </span>
                <input
                  type="file"
                  multiple
                  onChange={async (event) => {
                    const uploaded = await Promise.all(Array.from(event.target.files ?? []).map(uploadAssignmentFile));
                    setAssignmentFiles((files) => [...files, ...uploaded]);
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              className="primary"
              disabled={assigning}
              onClick={assign}
            >
              {assigning ? "Assigning..." : "Assign & Send Email"}
            </button>
            {assignError && <small className="error">{assignError}</small>}
          </div>
        </div>
      )}
      {open === "designer" && (
        <div className="modal-backdrop">
          <div className="quick-modal designer-modal">
            <button className="modal-close" onClick={() => setOpen(null)}>
              ×
            </button>
            <h3>New Designer</h3>
            <label className="field">
              Designer Name
              <input
                value={newDesigner.name}
                onChange={(e) =>
                  setNewDesigner((v) => ({ ...v, name: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Designer Email
              <input
                type="email"
                value={newDesigner.email}
                onChange={(e) =>
                  setNewDesigner((v) => ({ ...v, email: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Phone Number
              <input
                value={newDesigner.phone}
                onChange={(e) =>
                  setNewDesigner((v) => ({ ...v, phone: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Address
              <input
                value={newDesigner.address}
                onChange={(e) =>
                  setNewDesigner((v) => ({ ...v, address: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Bank Account Number
              <input
                value={newDesigner.bankAccount}
                onChange={(e) =>
                  setNewDesigner((v) => ({ ...v, bankAccount: e.target.value }))
                }
              />
            </label>
            <button
              className="primary"
              disabled={
                !newDesigner.name ||
                !newDesigner.email ||
                !newDesigner.phone ||
                !newDesigner.address ||
                !newDesigner.bankAccount
              }
              onClick={addDesigner}
            >
              Add Designer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function Portal({ token, designerName }: { token: string; designerName: string }) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [range, setRange] = useState<DateRange>("All Time");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([]);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const load = () =>
    api<Assignment[]>(
      `/assignments?assignedDateRange=${encodeURIComponent(range)}`,
      token,
    ).then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, [range]);
  const update = async (id: string, status: string) => {
    const updated = await api<Assignment>(`/assignments/${id}/status`, token, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setSelected(updated);
    load();
  };
  const submitDelivery = async () => {
    if (!selected || !deliveryFiles.length) { setDeliveryError("Choose at least one final file before submitting."); return; }
    setDeliveryError("");
    setDeliverySaving(true);
    try {
      const updated = await api<Assignment>(`/assignments/${selected.id}/deliveries`, token, { method: "POST", body: JSON.stringify({ note: deliveryNote, files: await Promise.all(deliveryFiles.map(async (file) => ({ name: file.name, data: await fileData(file) }))) }) });
      setSelected(updated);
      setDeliveryFiles([]);
      setDeliveryNote("");
      load();
    } catch (error) { setDeliveryError(error instanceof Error ? error.message : "Could not submit the final files."); }
    finally { setDeliverySaving(false); }
  };
  const chooseDeliveryFiles = (files: File[]) => {
    const remaining = 6 - (selected?.deliveries?.length ?? 0);
    setDeliveryFiles((current) => [...current, ...files].slice(0, Math.max(0, remaining)));
  };
  const removeDelivery = async (filePath: string) => {
    if (!selected) return;
    const updated = await api<Assignment>(`/assignments/${selected.id}/deliveries?path=${encodeURIComponent(filePath)}`, token, { method: "DELETE" });
    setSelected(updated);
    load();
  };
  const projectRows = rows.filter((row) => row.projectName !== "Manual payment" && row.projectName !== "Manual designer payment");
  const types = ["All", ...Array.from(new Set(projectRows.map((row) => row.projectType).filter(Boolean)))];
  const visibleRows = projectRows.filter((row) => `${row.projectName} ${row.logoName ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (typeFilter === "All" || row.projectType === typeFilter));
  const inProgress = projectRows.filter((row) => row.status === "In Progress").length;
  const submitted = projectRows.filter((row) => row.status === "Delivered").length;
  const notStarted = projectRows.filter((row) => (row.status ?? "Not Started") === "Not Started").length;
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  const pending = rows.reduce((sum, row) => sum + Math.max(0, row.payment - row.paid), 0);
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Hi, {designerName.split(" ")[0] || "Designer"}</h1>
          <p className="muted">
            Your projects and payments — nothing else lives on your account.
          </p>
        </div>
      </header>
      <div className="stats designer-summary-stats">
        <StatCard
          icon={Palette}
          label="Total Projects"
          value={projectRows.length}
          sub={`${inProgress} in progress`}
        />
        <StatCard icon={Target} label="Not Started Yet" value={notStarted} sub="Waiting on you" />
        <StatCard icon={CheckCircle2} label="Submitted" value={submitted} sub="Delivered to client" />
        <StatCard
          icon={Wallet}
          label="Pending Payment"
          value={`PKR ${pending.toLocaleString()}`}
          sub={`PKR ${paid.toLocaleString()} paid so far`}
        />
      </div>
      <div className="designer-workspace">
      <SectionCard title="My Projects">
      <div className="designer-portal-filters">
        <label className="field designer-search-field"><span className="sr-only">Search projects</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by logo name..." /></label>
        <label className="field designer-type-field"><span className="sr-only">Project type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>{types.map((type) => <option key={type}>{type === "All" ? "All Project Types" : type}</option>)}</select></label>
        <DateRangeFilter value={range} onChange={setRange} label="" />
      </div>
      <div className="client-grid designer-portal-grid">
        {visibleRows.map((a) => (
          <SectionCard
            key={a.id}
            title={a.projectName}
            right={<Badge text={a.paid >= a.payment ? "Paid" : "Unpaid"} />}
          >
            <p className="muted">
              {a.projectType} · Assigned {a.assignedDate}
            </p>
            <p>{a.description}</p>
            <button className="outline-button" onClick={() => setSelected(a)}>View project details</button>
            <select
              value={a.status ?? "Not Started"}
              onChange={(e) => update(a.id, e.target.value)}
            >
              <option>Not Started</option>
              <option>In Progress</option>
              <option>Delivered</option>
            </select>
          </SectionCard>
        ))}
      </div>
      {!visibleRows.length && <Empty text="No assigned projects match these filters." />}
      </SectionCard>
      <SectionCard title="My Payments">
        <div className="designer-payments-list">
          {rows.filter((row) => row.payment > 0).map((row) => <div className="designer-payment-row" key={row.id}><div><b>{row.projectName}</b><em className={row.paid >= row.payment ? "paid" : "pending"}>{row.paid >= row.payment ? "Paid in full" : `PKR ${(row.payment - row.paid).toLocaleString()} pending`}</em></div><strong>PKR {row.payment.toLocaleString()}</strong></div>)}
          {!rows.some((row) => row.payment > 0) && <Empty text="No payment records yet." />}
        </div>
        <div className="designer-payment-total"><span>Total Paid</span><b>PKR {paid.toLocaleString()}</b></div>
      </SectionCard>
      </div>
      {selected && <Modal title={selected.logoName || selected.projectName} onClose={() => setSelected(null)}>
        <div className="designer-project-detail">
          <div className="badge-grid"><Badge text={selected.projectType} /><Badge text={selected.status === "Delivered" ? "Delivered" : selected.status === "In Progress" ? "In Progress" : "Not Started"} /></div>
          <div><small>Project Name</small><b>{selected.projectName}</b></div>
          <div><small>Assigned Date</small><b>{selected.assignedDate}</b></div>
          <div><small>Description</small><p>{selected.description || "No description provided."}</p></div>
          <div><small>Attached Files</small>{selected.attachedFiles?.length ? <div className="designer-file-list">{selected.attachedFiles.map((file) => file.startsWith("/files/") ? <button key={file} onClick={() => downloadAttachment(file, token).catch(() => window.alert("Could not download this file"))}><Paperclip size={14} /> {attachmentLabel(file)}</button> : <span className="legacy-file" key={file}><Paperclip size={14} /> {attachmentLabel(file)} <small>Re-upload required</small></span>)}</div> : <p className="muted">No files attached.</p>}</div>
          <div className="designer-delivery">
            <small>Deliver Final Files to Admin (up to 6 files)</small>
            {selected.deliveries?.length ? <div className="designer-file-list">{selected.deliveries.map((file) => <span className="delivered-file" key={file.path}><button onClick={() => downloadAttachment(file.path, token).catch(() => window.alert("Could not download this file"))}><Paperclip size={14} /> {file.name}</button><button className="remove-delivery" type="button" aria-label={`Remove ${file.name}`} onClick={() => removeDelivery(file.path).catch((error) => window.alert(error instanceof Error ? error.message : "Could not remove this file"))}>×</button></span>)}</div> : null}
            {(selected.deliveries?.length ?? 0) < 6 ? <>
              <label className="attachment-dropzone"><Paperclip size={15} /><span>{deliveryFiles.length ? `${deliveryFiles.length} new file${deliveryFiles.length === 1 ? "" : "s"} ready — ${6 - (selected.deliveries?.length ?? 0) - deliveryFiles.length} slot${6 - (selected.deliveries?.length ?? 0) - deliveryFiles.length === 1 ? "" : "s"} left` : "Choose one or more final files"}</span><input type="file" multiple onChange={(event) => chooseDeliveryFiles(Array.from(event.target.files ?? []))} /></label>
              {deliveryFiles.length ? <div className="delivery-queue">{deliveryFiles.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={13} /> {file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setDeliveryFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>×</button></span>)}</div> : null}
              <textarea value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Delivery note for Admin (optional)" />
              {!deliveryFiles.length && <small className="muted">Choose at least one file above to enable submission.</small>}
              {deliveryError && <small className="error">{deliveryError}</small>}
              <button className="primary" disabled={deliverySaving || !deliveryFiles.length} onClick={submitDelivery}>{deliverySaving ? "Submitting Files..." : "Submit Files to Admin"}</button>
            </> : <p className="muted">All 6 final-file slots have been used.</p>}
          </div>
          <div><small>Update Status</small><div className="designer-status-actions">{(["Not Started", "In Progress", "Delivered"] as const).map((status) => <button className={selected.status === status ? "active" : ""} key={status} onClick={() => update(selected.id, status)}>{status === "Delivered" ? "Submitted" : status}</button>)}</div></div>
        </div>
      </Modal>}
    </>
  );
}
function Finance({ token }: { token: string }) {
  const [data, setData] = useState<{
    incomeUSD: number;
    incomePKR: number;
    expensesPKR: number;
    netProfitPKR: number;
    designerPaymentsPKR: number;
  }>();
  const [range, setRange] = useState<DateRange>("All Time");
  const [exchangeRate, setExchangeRate] = useState("278");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState<"Income" | "Expenses">("Income");
  const [clients, setClients] = useState<Client[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [expenses, setExpenses] = useState<Array<{ id: string; name: string; amount: number; date: string; category?: string; description?: string }>>([]);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentCategoryModal, setPaymentCategoryModal] = useState(false);
  const [paymentClientId, setPaymentClientId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentExchangeRate, setPaymentExchangeRate] = useState("278");
  const [paymentCurrency, setPaymentCurrency] = useState<"USD" | "CAD" | "EUR">("USD");
  const [designerPaymentModal, setDesignerPaymentModal] = useState(false);
  const [designerPayment, setDesignerPayment] = useState({ designerName: "", amount: "", date: new Date().toISOString().slice(0, 10), note: "" });
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ name: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const load = async () => {
    const [summary, clientRows, assignmentRows, expenseRows, designerRows] = await Promise.all([
      api<typeof data>(`/finance/summary?dateRange=${encodeURIComponent(range)}&exchangeRate=${encodeURIComponent(exchangeRate)}`, token),
      api<Client[]>("/clients", token),
      api<Assignment[]>(`/assignments?assignedDateRange=${encodeURIComponent(range)}`, token),
      api<Array<{ id: string; name: string; amount: number; date: string; category?: string; description?: string }>>("/expenses", token),
      api<Designer[]>("/designers", token),
    ]);
    setData(summary); setClients(clientRows); setAssignments(assignmentRows); setExpenses(expenseRows); setDesigners(designerRows);
  };
  const addExpense = async () => {
    const name = window.prompt("Expense name");
    const amount = Number(window.prompt("Expense amount in PKR"));
    if (!name || !amount) return;
    await api("/expenses", token, {
      method: "POST",
      body: JSON.stringify({ name, amount }),
    });
    load();
  };
  const addClientPayment = async (client: Client) => {
    const amount = Number(window.prompt(`Payment received from ${client.company} (USD)`));
    if (!amount) return;
    await api(`/clients/${client.id}/payments`, token, { method: "POST", body: JSON.stringify({ amount, date: new Date().toISOString().slice(0, 10) }) });
    load();
  };
  const submitPayment = async () => {
    if (!paymentClientId || !Number(paymentAmount)) return;
    const usdAmount = Number(paymentAmount) * ({ USD: 1, CAD: 0.73, EUR: 1.09 }[paymentCurrency]);
    await api(`/clients/${paymentClientId}/payments`, token, { method: "POST", body: JSON.stringify({ amount: usdAmount, originalAmount: Number(paymentAmount), currency: paymentCurrency, convertedPKR: usdAmount * Number(paymentExchangeRate || 0), date: paymentDate }) });
    setPaymentModal(false); setPaymentAmount(""); setPaymentClientId(""); load();
  };
  const submitDesignerPayment = async () => {
    if (!designerPayment.designerName || !Number(designerPayment.amount)) return;
    try {
      await api("/assignments/designer-payment", token, { method: "POST", body: JSON.stringify({ ...designerPayment, amount: Number(designerPayment.amount) }) });
      setDesignerPaymentModal(false); setDesignerPayment({ designerName: "", amount: "", date: new Date().toISOString().slice(0, 10), note: "" }); await load(); setTab("Expenses");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not add the designer payment.");
    }
  };
  const submitExpense = async () => {
    if (!expenseForm.name || !Number(expenseForm.amount)) return;
    await api("/expenses", token, { method: "POST", body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }) });
    setExpenseModal(false); setExpenseForm({ name: "", amount: "", date: new Date().toISOString().slice(0, 10) }); load();
  };
  useEffect(() => {
    load().catch(() => {});
  }, [token, range, exchangeRate]);
  const inMonth = (date: string) => !selectedMonth || date.startsWith(selectedMonth);
  const incomeRows = clients.flatMap((client) => client.payments.filter((payment) => inMonth(payment.date)).map((payment) => ({ client: client.company, payment })));
  const expenseRows = expenses.filter((expense) => inMonth(expense.date));
  const designerRows = assignments.filter((item) => inMonth(item.assignedDate));
  const download = (filename: string, rows: Array<Array<string | number | undefined>>) => { const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); };
  const financeRows = tab === "Income"
    ? [["Date", "Client Name", "Amount", "Currency"], ...incomeRows.map(({ client, payment }) => [payment.date, client, payment.originalAmount ?? payment.amount, payment.currency ?? "USD"])]
    : [["Date", "Payee / Expense", "Category", "Details", "Amount", "Currency"], ...expenseRows.map((expense) => [expense.date, expense.name, expense.category ?? "Other Expense", expense.description ?? "", expense.amount, "PKR"]), ...designerRows.filter((item) => item.paid > 0).map((item) => [item.assignedDate, item.designerName, "Designer Payment", item.projectName, item.paid, "PKR"])];
  const completeFinanceRows: Array<Array<string | number | undefined>> = [
    ["INCOME"], ["Date", "Client Name", "Amount", "Currency"],
    ...incomeRows.map(({ client, payment }) => [payment.date, client, payment.originalAmount ?? payment.amount, payment.currency ?? "USD"]),
    [], ["DESIGNER PAYMENTS"], ["Date", "Designer", "Project / Note", "Amount", "Currency"],
    ...designerRows.filter((item) => item.paid > 0).map((item) => [item.assignedDate, item.designerName, item.projectName, item.paid, "PKR"]),
    [], ["OTHER EXPENSES"], ["Date", "Expense Name", "Amount", "Currency"],
    ...expenseRows.map((expense) => [expense.date, expense.name, expense.amount, "PKR"]),
  ];
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Finance</h1>
          <p className="muted">Client income is USD; designer pay and expenses are PKR.</p>
        </div>
        <button className="primary" onClick={() => setPaymentCategoryModal(true)}><Plus size={15} /> Add Payment</button>
      </header>
      <div className="finance-range"><DateRangeFilter value={range} onChange={setRange} /></div>
      <SectionCard title="" right={<label className="finance-rate">1 USD = <input type="number" min="1" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /> PKR</label>}>
        <div className="finance-stat-grid">
          <button onClick={() => setTab("Income")}><small>Total Income (USD)</small><b>${data?.incomeUSD ?? 0}</b></button><button onClick={() => setTab("Income")}><small>Total Income (PKR)</small><b>Rs {(data?.incomePKR ?? 0).toLocaleString()}</b></button><button onClick={() => setTab("Expenses")}><small>Total Expenses (PKR)</small><b className="pending">Rs {(data?.expensesPKR ?? 0).toLocaleString()}</b></button><button onClick={() => setTab("Expenses")}><small>Net Profit (PKR)</small><b className="paid">Rs {(data?.netProfitPKR ?? 0).toLocaleString()}</b></button>
        </div>
        <button className="finance-designer-link" onClick={() => setTab("Expenses")}>Designer payments included: Rs {(data?.designerPaymentsPKR ?? 0).toLocaleString()} →</button>
      </SectionCard>
      <section className="finance-inline-section"><div className="finance-record-actions"><label className="field finance-record-type">Records<select value={tab} onChange={(event) => setTab(event.target.value as "Income" | "Expenses")}><option value="Income">Client Income</option><option value="Expenses">Expenses</option></select></label><button className="outline-button" onClick={() => download(`finance-${selectedMonth}.csv`, completeFinanceRows)}>Download Finance CSV</button></div><div className="finance-detail-filter"><label className="field">Month & Year<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label></div><div className="finance-detail-table"><div className="finance-detail-head">{financeRows[0].map((cell) => <b key={String(cell)}>{cell}</b>)}</div>{financeRows.slice(1).map((row, index) => <div className="finance-detail-row" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</div></section>
      {paymentCategoryModal && <div className="modal-backdrop"><div className="quick-modal payment-category-modal"><button className="modal-close" onClick={() => setPaymentCategoryModal(false)}>×</button><h3>Add Financial Record</h3><p className="muted">Choose where this transaction belongs.</p><button className="finance-category-choice" onClick={() => { setPaymentCategoryModal(false); setPaymentModal(true); }}><b>Client Payment</b><small>Income received from a client</small></button><button className="finance-category-choice" onClick={() => { setPaymentCategoryModal(false); setDesignerPaymentModal(true); }}><b>Designer Payment</b><small>Payment made to a designer</small></button><button className="finance-category-choice" onClick={() => { setPaymentCategoryModal(false); setExpenseModal(true); }}><b>Other Expense</b><small>Business cost such as supplies or tools</small></button></div></div>}
      {paymentModal && <div className="modal-backdrop"><div className="quick-modal payment-modal"><button className="modal-close" onClick={() => setPaymentModal(false)}>×</button><h3>Add Client Payment</h3><label className="field">Client<select value={paymentClientId} onChange={(event) => setPaymentClientId(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.company}</option>)}</select>{paymentClientId && <small className="muted">Currently received: ${clients.find((client) => client.id === paymentClientId)?.paid ?? 0}.</small>}</label><div className="payment-currency-grid"><label className="field">Amount Received ({paymentCurrency})<input type="number" min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0" /></label><label className="field">Currency<select value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value as "USD" | "CAD" | "EUR")}><option>USD</option><option>CAD</option><option>EUR</option></select></label></div><div className="payment-converter"><span>{paymentCurrency} {paymentAmount || "0"} <i>≈</i> <b>USD {(Number(paymentAmount || 0) * ({ USD: 1, CAD: 0.73, EUR: 1.09 }[paymentCurrency])).toFixed(2)}</b></span><label>1 USD = <input type="number" min="1" value={paymentExchangeRate} onChange={(event) => setPaymentExchangeRate(event.target.value)} /> PKR</label><b>Finance value: Rs {(Number(paymentAmount || 0) * ({ USD: 1, CAD: 0.73, EUR: 1.09 }[paymentCurrency]) * Number(paymentExchangeRate || 0)).toLocaleString()}</b></div><label className="field">Date Received<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><button className="primary" disabled={!paymentClientId || !Number(paymentAmount)} onClick={submitPayment}>Add Payment</button></div></div>}
      {designerPaymentModal && <div className="modal-backdrop"><div className="quick-modal payment-modal"><button className="modal-close" onClick={() => setDesignerPaymentModal(false)}>×</button><h3>Add Designer Payment</h3><label className="field">Designer<select value={designerPayment.designerName} onChange={(e) => setDesignerPayment((v) => ({ ...v, designerName: e.target.value }))}><option value="">Select designer</option>{designers.map((designer) => <option key={designer.id} value={designer.name}>{designer.name}</option>)}</select></label><label className="field">Amount (PKR)<input type="number" value={designerPayment.amount} onChange={(e) => setDesignerPayment((v) => ({ ...v, amount: e.target.value }))} placeholder="0" /></label><label className="field">Date Paid<input type="date" value={designerPayment.date} onChange={(e) => setDesignerPayment((v) => ({ ...v, date: e.target.value }))} /></label><label className="field">Note (optional)<input value={designerPayment.note} onChange={(e) => setDesignerPayment((v) => ({ ...v, note: e.target.value }))} placeholder="e.g. Bonus for rush job" /></label><button className="primary" disabled={!designerPayment.designerName || !Number(designerPayment.amount)} onClick={submitDesignerPayment}>Add Payment</button></div></div>}
      {expenseModal && <div className="modal-backdrop"><div className="quick-modal payment-modal"><button className="modal-close" onClick={() => setExpenseModal(false)}>×</button><h3>Add Expense</h3><label className="field">Expense Name<input value={expenseForm.name} onChange={(e) => setExpenseForm((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. Thread & bobbins" /></label><label className="field">Amount (PKR)<input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((v) => ({ ...v, amount: e.target.value }))} placeholder="0" /></label><label className="field">Date<input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((v) => ({ ...v, date: e.target.value }))} /></label><button className="primary" disabled={!expenseForm.name || !Number(expenseForm.amount)} onClick={submitExpense}>Add Expense</button></div></div>}
    </>
  );
}
function downloadReportPdf(filename: string, title: string, lines: string[]) {
  const clean = (value: string) => value.replace(/[^\x20-\x7E]/g, "-").replace(/[()\\]/g, "\\$&");
  const text = [title, `Generated: ${new Date().toLocaleString()}`, "", ...lines].map(clean);
  const stream = `BT\n/F1 18 Tf\n50 790 Td\n(${text[0]}) Tj\n/F1 10 Tf\n0 -24 Td\n${text.slice(1).map((line) => `(${line}) Tj\n0 -15 Td`).join("\n")}\nET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const startXref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}

function Reports({ token }: { token: string }) {
  const [range, setRange] = useState<DateRange>("All Time");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [tab, setTab] = useState<"Sales" | "Caller" | "Finance">("Sales");
  const [sales, setSales] = useState<{ totalLeads: number; won: number; lost: number; followUps: number; opportunities: number }>();
  const [callers, setCallers] = useState<Array<{ name: string; calls: number; leads: number }>>([]);
  const [finance, setFinance] = useState<{ incomeUSD: number; expensesPKR: number; designerPaymentsPKR: number }>();
  useEffect(() => {
    const query = `dateRange=${encodeURIComponent(range)}&from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`;
    Promise.all([
      api<typeof sales>(`/reports/sales?${query}`, token),
      api<typeof callers>(`/reports/caller?${query}`, token),
      api<typeof finance>(`/reports/finance?${query}`, token),
    ]).then(([salesData, callerData, financeData]) => { setSales(salesData); setCallers(callerData); setFinance(financeData); }).catch(() => {});
  }, [token, range, reportFrom, reportTo]);
  const callerCalls = callers.reduce((sum, caller) => sum + caller.calls, 0);
  const pdfLines = tab === "Sales" ? [`Date range: ${range}`, `Total leads: ${sales?.totalLeads ?? 0}`, `Won leads: ${sales?.won ?? 0}`, `Lost leads: ${sales?.lost ?? 0}`, `Open follow-ups: ${sales?.followUps ?? 0}`] : tab === "Caller" ? [`Date range: ${range}`, `Total qualified calls: ${callerCalls}`, `Interested leads: ${sales?.opportunities ?? 0}`, `Won deals: ${sales?.won ?? 0}`, "", ...callers.map((caller) => `${caller.name}: ${caller.calls} calls, ${caller.leads} leads`)] : [`Date range: ${range}`, `Client payments: USD ${finance?.incomeUSD ?? 0}`, `Designer payments: PKR ${(finance?.designerPaymentsPKR ?? 0).toLocaleString()}`, `Other and designer expenses: PKR ${(finance?.expensesPKR ?? 0).toLocaleString()}`];
  const cards = tab === "Sales" ? [<StatCard key="leads" icon={Users} label="Total Leads" value={sales?.totalLeads ?? 0} sub={range} />, <StatCard key="won" icon={CheckCircle2} label="Won Leads" value={sales?.won ?? 0} sub={range} />, <StatCard key="lost" icon={X} label="Lost Leads" value={sales?.lost ?? 0} sub={range} />, <StatCard key="follow" icon={CalendarDays} label="Open Follow-ups" value={sales?.followUps ?? 0} sub={range} />] : tab === "Caller" ? [<StatCard key="calls" icon={PhoneCall} label="Total Calls" value={callerCalls} sub={range} />, <StatCard key="interested" icon={Target} label="Interested Leads" value={sales?.opportunities ?? 0} sub={range} />, <StatCard key="won" icon={CheckCircle2} label="Won Deals" value={sales?.won ?? 0} sub={range} />] : [<StatCard key="income" icon={Wallet} label="Client Payments" value={`$${finance?.incomeUSD ?? 0}`} sub={range} />, <StatCard key="designer" icon={Users} label="Designer Payments" value={`Rs ${(finance?.designerPaymentsPKR ?? 0).toLocaleString()}`} sub={range} />, <StatCard key="expense" icon={BriefcaseBusiness} label="Expenses" value={`Rs ${(finance?.expensesPKR ?? 0).toLocaleString()}`} sub={range} />];
  return <><header className="page-header reports-header"><div><h1 className="page-title display">Reports</h1><p className="muted">Simple cards and numbers — built for a fast glance.</p></div><button className="outline-button" onClick={() => downloadReportPdf(`${tab.toLowerCase()}-report.pdf`, `${tab} Report`, pdfLines)}><Download size={15} /> Download {tab} PDF</button></header><div className="reports-range"><DateRangeFilter value={range} onChange={setRange} /><label className="field field--compact report-calendar">From<input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></label><label className="field field--compact report-calendar">To<input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} /></label></div><div className="reports-tabs"><button className={tab === "Sales" ? "active" : ""} onClick={() => setTab("Sales")}>Sales</button><button className={tab === "Caller" ? "active" : ""} onClick={() => setTab("Caller")}>Caller</button><button className={tab === "Finance" ? "active" : ""} onClick={() => setTab("Finance")}>Finance</button></div><div className="stats reports-stats">{cards}</div></>;
}

function UsersView({ token }: { token: string }) {
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string; phone?: string }>>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: "", email: "", phone: "", role: "Caller" as "Caller" | "Designer" });
  const [userError, setUserError] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [roleTarget, setRoleTarget] = useState<(typeof users)[number] | null>(null);
  const [roleValue, setRoleValue] = useState<"Caller" | "Designer">("Caller");
  const [roleError, setRoleError] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [editTarget, setEditTarget] = useState<(typeof users)[number] | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    Promise.all([api<typeof users>("/users", token), api<Lead[]>("/leads", token)]).then(([userRows, leadRows]) => { setUsers(userRows); setLeads(leadRows); }).catch(() => {});
  }, [token]);
  const addUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.phone.trim()) return;
    setAddingUser(true); setUserError("");
    try {
      const user = await api<(typeof users)[number]>("/users", token, {
        method: "POST",
        body: JSON.stringify(userForm),
      });
      setUsers((items) => [...items, user]); setShowAddUser(false); setUserForm({ name: "", email: "", phone: "", role: "Caller" });
    } catch (error) { setUserError(error instanceof Error ? error.message : "Could not create this user."); } finally { setAddingUser(false); }
  };
  const assignExistingRole = async () => {
    if (!roleTarget) return;
    setSavingRole(true); setRoleError("");
    try {
      const updated = await api<(typeof users)[number]>(`/users/${roleTarget.id}/role`, token, {
        method: "PATCH",
        body: JSON.stringify({ role: roleValue }),
      });
      setUsers((items) => items.map((user) => user.id === updated.id ? updated : user));
      setRoleTarget(null);
    } catch (error) { setRoleError(error instanceof Error ? error.message : "Could not assign this role."); } finally { setSavingRole(false); }
  };
  const saveUserName = async () => {
    if (!editTarget || !editName.trim()) return;
    setSavingName(true); setEditError("");
    try {
      const updated = await api<(typeof users)[number]>(`/users/${editTarget.id}/name`, token, { method: "PATCH", body: JSON.stringify({ name: editName.trim() }) });
      setUsers((items) => items.map((user) => user.id === updated.id ? updated : user));
      setEditTarget(null);
    } catch (error) { setEditError(error instanceof Error ? error.message : "Could not update this name."); } finally { setSavingName(false); }
  };
  const visibleUsers = users;
  const callers = users.filter((user) => user.role === "Caller");
  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title display">Users</h1>
          <p className="muted">All Supabase accounts appear here. Assign a CRM role before a new user can access the CRM.</p>
        </div>
        <button className="primary" onClick={() => setShowAddUser(true)}>
          <Plus size={16} /> Add User
        </button>
      </header>
      <div className="table users-table">
        {visibleUsers.map((user) => (
          <div className="lead-row user-row" key={user.id}>
            <span><strong>{user.role === "Admin" ? `${user.name} (Admin)` : user.name}</strong><small>{user.email}</small></span>
            <span className="user-row__role"><Badge text={user.role} /><button className="outline-button compact-button" onClick={() => { setEditTarget(user); setEditName(user.name); setEditError(""); }}>Edit name</button>{user.role === "Unassigned" && <button className="outline-button compact-button" onClick={() => { setRoleTarget(user); setRoleValue("Caller"); setRoleError(""); }}>Assign role</button>}</span>
          </div>
        ))}
      </div>
      {showAddUser && <Modal title="Add User" onClose={() => setShowAddUser(false)}><div className="add-user-form"><p className="muted">An invitation email will let this person create their own password.</p><TextField label="Full Name" value={userForm.name} onChange={(name) => setUserForm((form) => ({ ...form, name }))} /><TextField label="Email" value={userForm.email} onChange={(email) => setUserForm((form) => ({ ...form, email }))} /><TextField label="Phone Number" value={userForm.phone} onChange={(phone) => setUserForm((form) => ({ ...form, phone }))} placeholder="+1 555 555 0100" /><label className="field">Assign Role<select value={userForm.role} onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as "Caller" | "Designer" }))}><option value="Caller">Caller</option><option value="Designer">Designer</option></select></label>{userError && <small className="error">{userError}</small>}<button className="primary" disabled={addingUser || !userForm.name.trim() || !userForm.email.trim() || !userForm.phone.trim()} onClick={addUser}>{addingUser ? "Sending invitation..." : "Create User & Send Invite"}</button></div></Modal>}
      {roleTarget && <Modal title="Assign CRM Role" onClose={() => setRoleTarget(null)}><div className="add-user-form"><p className="muted">{roleTarget.name}<br />{roleTarget.email}</p><label className="field">Assign Role<select value={roleValue} onChange={(event) => setRoleValue(event.target.value as "Caller" | "Designer")}><option value="Caller">Caller</option><option value="Designer">Designer</option></select></label>{roleError && <small className="error">{roleError}</small>}<button className="primary" disabled={savingRole} onClick={assignExistingRole}>{savingRole ? "Saving role..." : "Save Role"}</button></div></Modal>}
      {editTarget && <Modal title="Edit User Name" onClose={() => setEditTarget(null)}><div className="add-user-form"><TextField label="Full Name" value={editName} onChange={setEditName} />{editError && <small className="error">{editError}</small>}<button className="primary" disabled={savingName || !editName.trim()} onClick={saveUserName}>{savingName ? "Saving..." : "Save Name"}</button><small className="muted">Email, password, and role cannot be changed here.</small></div></Modal>}
    </>
  );
}

function NewOpportunityForm({
  leads,
  token,
  selectedLead,
  onCancel,
  onCreated,
}: {
  leads: Lead[];
  token: string;
  selectedLead: Lead | null;
  onCancel: () => void;
  onCreated: (leadId: string) => void;
}) {
  const [form, setForm] = useState({
    leadId: selectedLead?.id ?? "",
    name: selectedLead ? `${selectedLead.company} opportunity` : "",
    projectType: "Digitizing",
    value: "",
    source: "Cold Call",
    tags: "",
    notes: "",
    trialDate: "",
    followupDate: "",
    emailLog: "",
    trialRateType: "Quoted",
  });
  const [trialFiles, setTrialFiles] = useState<string[]>([]);
  const uploadTrialFile = async (file: File) => {
    const uploaded = await api<{ path: string }>("/files", token, {
      method: "POST",
      body: JSON.stringify({ name: file.name, data: await fileData(file) }),
    });
    return uploaded.path;
  };
  const [pocs, setPocs] = useState([{ name: "", email: "", phone: "" }]);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const selectedCompany = leads.find((lead) => lead.id === form.leadId);
  const updatePoc = (index: number, key: "name" | "email" | "phone", value: string) =>
    setPocs((items) => items.map((poc, itemIndex) => itemIndex === index ? { ...poc, [key]: value } : poc));
  const submit = async () => {
    if (!form.leadId || !form.name.trim()) return;
    setSaving(true);
    try {
      await api(`/leads/${form.leadId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          hot: false,
          status: form.trialRateType === "Paid" ? "Closed - Won" : "Contacted",
          opportunity: {
            connected: true,
            emailSent: Boolean(form.emailLog.trim()),
            createdAt: new Date().toISOString(),
            pocs: pocs.filter((poc) => poc.name && poc.email).map((poc) => ({ id: crypto.randomUUID(), name: poc.name, role: "", email: poc.email, phone: poc.phone })),
            trial: { given: Boolean(trialFiles.length), date: form.trialDate, logoName: "", projectType: form.projectType, notes: "", attachments: trialFiles, rateType: form.trialRateType },
            orders: form.trialRateType === "Paid" ? [{ projectName: form.name, amount: Number(form.value || 0), notes: form.notes, date: new Date().toISOString().slice(0, 10) }] : [],
            name: form.name,
            value: Number(form.value || 0),
            source: form.source,
            tags: form.tags,
            notes: form.notes,
            followupDate: form.followupDate,
          },
        }),
      });
      onCreated(form.leadId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not create the opportunity.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="new-opportunity-page">
      <header className="page-header">
        <div>
          <h1 className="page-title display">New Opportunity</h1>
          <p className="muted">Create the opportunity first, then progress it through the five pipeline stages.</p>
        </div>
        <button className="outline-button" onClick={onCancel}>← Back</button>
      </header>
      <section className="opportunity-form-card opportunity-lead-card">
        <label className="field">
          Select Lead <b>*</b>
          <select value={form.leadId} onChange={(event) => update("leadId", event.target.value)}>
            <option value="">Search or select a lead</option>
            {leads.filter((lead) => !lead.opportunity).map((lead) => <option value={lead.id} key={lead.id}>{lead.company} — {lead.contactName || "No contact yet"}</option>)}
          </select>
          <small>Stage 1 is created for this selected lead.</small>
        </label>
        {selectedCompany && <div className="opportunity-company-summary"><b>Stage 1 — Call Connected</b><span>{selectedCompany.company}</span><small>{selectedCompany.contactName || "No contact"} · {displayPhone(selectedCompany.phone)} · {selectedCompany.city || "City not added"}</small></div>}
      </section>
      <section className="opportunity-form-card opportunity-core-card">
        <div className="opportunity-form-grid">
          <label className="field">Opportunity Name <b>*</b><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Company logo digitizing" /></label>
          <label className="field">Project Type<select value={form.projectType} onChange={(event) => update("projectType", event.target.value)}><option>Digitizing</option><option>Embroidery</option><option>Vector Art</option><option>Custom Patches</option></select></label>
          <label className="field">Quoted Value (USD)<input type="number" value={form.value} onChange={(event) => update("value", event.target.value)} placeholder="0" /></label>
          <label className="field">Opportunity Source<input value={form.source} onChange={(event) => update("source", event.target.value)} placeholder="Cold call, referral, website..." /></label>
          <label className="field full-span">Tags<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. urgent, repeat client" /></label>
          <label className="field full-span">Notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Additional opportunity details..." /></label>
        </div>
      </section>
      <section className="opportunity-form-card">
        <h3>Stage 2 — Point of Contact</h3>
        {pocs.map((poc, index) => <div className="opportunity-form-grid poc-form-row" key={index}>
          <label className="field">POC Full Name<input value={poc.name} onChange={(event) => updatePoc(index, "name", event.target.value)} /></label>
          <label className="field">POC Email<input type="email" value={poc.email} onChange={(event) => updatePoc(index, "email", event.target.value)} /></label>
          <label className="field">POC Phone Number<input value={poc.phone} onChange={(event) => updatePoc(index, "phone", event.target.value)} /></label>
          {index === 0 && <label className="field">Next Follow-up Date<input type="date" value={form.followupDate} onChange={(event) => update("followupDate", event.target.value)} /></label>}
          {index > 0 && <button className="outline-button remove-poc" type="button" onClick={() => setPocs((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove POC</button>}
        </div>)}
        <button className="outline-button" type="button" disabled={pocs.length >= 5} onClick={() => setPocs((items) => [...items, { name: "", email: "", phone: "" }])}>+ Add POC {pocs.length >= 5 ? "(maximum 5)" : ""}</button>
      </section>
      <section className="opportunity-form-card"><h3>Stage 3 — Email Log</h3><label className="field">Email log / subject<textarea value={form.emailLog} onChange={(event) => update("emailLog", event.target.value)} placeholder="Record the email sent to the POC (Gmail connection can be added later)." /></label></section>
      <section className="opportunity-form-card"><h3>Stage 4 — Free Trial</h3><div className="opportunity-form-grid"><label className="field">Trial Date<input type="date" value={form.trialDate} onChange={(event) => update("trialDate", event.target.value)} /></label><label className="field">Rate Type<select value={form.trialRateType} onChange={(event) => update("trialRateType", event.target.value)}><option>Quoted</option><option>Paid</option></select></label></div><AttachmentRows files={trialFiles} onChoose={(file) => uploadTrialFile(file).then((path) => setTrialFiles((files) => [path, ...files.slice(1)])).catch(() => window.alert("Could not upload this file"))} onAdd={(files) => Promise.all(files.map(uploadTrialFile)).then((paths) => setTrialFiles((current) => [...current, ...paths])).catch(() => window.alert("Could not upload these files"))} /><p className="muted">If Paid is selected, Stage 5 converts this lead into a client automatically.</p></section>
      <section className="opportunity-form-card"><h3>Stage 5 — Client Conversion</h3><p className="muted">{form.trialRateType === "Paid" ? "This will be created automatically when you save." : "Select Paid in Stage 4 when real work is given to create this stage."}</p></section>
      <footer className="opportunity-form-actions">
        <button className="outline-button" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!form.leadId || !form.name.trim() || saving} onClick={submit}>{saving ? "Creating..." : "Create Opportunity"}</button>
      </footer>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
      try {
        const saved = localStorage.getItem(SESSION_STORAGE_KEY);
        return saved ? JSON.parse(saved) as Session : null;
      } catch { return null; }
    }),
    [view, setView] = useState("dashboard"),
    [theme, setTheme] = useState<"dark" | "light">("dark"),
    [range, setRange] = useState<DateRange>("All Time"),
    [leads, setLeads] = useState<Lead[]>([]),
    [opportunityLead, setOpportunityLead] = useState<Lead | null>(null),
    [openOpportunityId, setOpenOpportunityId] = useState<string | null>(null),
    [searchQuery, setSearchQuery] = useState(""),
    [searchLeadId, setSearchLeadId] = useState<string | null>(null),
    [notifications, setNotifications] = useState<AppNotification[]>([]),
    [notificationOpen, setNotificationOpen] = useState(false),
    [pushStatus, setPushStatus] = useState(""),
    [gmailConnection, setGmailConnection] = useState<GmailConnection | null>(null),
    [gmailConnecting, setGmailConnecting] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session]);
  const enablePushNotifications = async () => {
    if (!session) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushStatus("This browser does not support alerts."); return; }
    if (Notification.permission === "denied") { setPushStatus("Allow notifications for localhost in your browser settings first."); return; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setPushStatus("Browser alerts were not allowed."); return; }
    try {
      const config = await api<{ configured: boolean; key: string | null }>("/push/public-key", session.token);
      if (!config.configured || !config.key) { setPushStatus("Browser alerts are not configured yet."); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(config.key) });
      await api("/push/subscribe", session.token, { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setPushStatus("Alerts enabled");
    } catch (error) { setPushStatus(error instanceof Error ? error.message : "Could not enable browser alerts."); }
  };
  const refresh = async () => {
    if (session && session.role !== "Designer")
      setLeads(
        await api<Lead[]>(
          `/leads?createdAtRange=${encodeURIComponent(range)}`,
          session.token,
        ),
      );
  };
  useEffect(() => {
    refresh().catch(() => {});
  }, [session, range]);
  useEffect(() => {
    if (!session) { setNotifications([]); return; }
    const loadNotifications = () => api<AppNotification[]>("/notifications", session.token).then(setNotifications).catch(() => {});
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 10000);
    return () => window.clearInterval(interval);
  }, [session]);
  const loadTopbarGmail = async () => {
    if (!session || session.role === "Designer") return null;
    try { const connection = await api<GmailConnection>("/gmail/status", session.token); setGmailConnection(connection); return connection; }
    catch { setGmailConnection(null); return null; }
  };
  useEffect(() => { loadTopbarGmail(); }, [session]);
  const connectTopbarGmail = async () => {
    if (!session) return;
    setGmailConnecting(true);
    const popup = window.open("", "vectrace-gmail", "width=560,height=700");
    try {
      const result = await api<{ url: string }>("/gmail/connect", session.token, { method: "POST" });
      if (popup) popup.location.href = result.url;
      else window.location.assign(result.url);
      const interval = window.setInterval(() => loadTopbarGmail().then((connection) => { if (connection?.connected) { setGmailConnecting(false); window.clearInterval(interval); } }), 2500);
      window.setTimeout(() => { window.clearInterval(interval); setGmailConnecting(false); }, 5 * 60 * 1000);
    } catch {
      popup?.close(); setGmailConnecting(false);
    }
  };
  const authHash = new URLSearchParams(window.location.hash.slice(1));
  const isInvite = Boolean(authHash.get("access_token")) && ["invite", "recovery"].includes(authHash.get("type") ?? "");
  if (!session && isInvite)
    return <InvitePassword theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />;
  if (!session)
    return (
      <Login
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onLogin={(s) => {
          setSession(s);
          setView(s.role === "Designer" ? "portal" : "dashboard");
        }}
      />
    );
  const nav =
    session.role === "Designer"
      ? [{ id: "portal", label: "My Work", icon: Palette }]
      : [
          { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { id: "leads", label: "Leads", icon: Phone },
          { id: "opportunities", label: "Opportunities", icon: Target },
          ...(session.role === "Admin"
            ? [
                { id: "clients", label: "Clients", icon: Users },
                { id: "designers", label: "Designers", icon: Palette },
                { id: "finance", label: "Finance", icon: Wallet },
                { id: "reports", label: "Reports", icon: Target },
                { id: "users", label: "Users", icon: Users },
              ]
            : []),
        ];
  return (
    <main className="crm crm--users-light">
      <aside className="sidebar">
        <div className="brand display">✂ Vectrace Emb</div>
        <nav>
          {nav.map((n) => (
            <NavItem
              key={n.id}
              {...n}
              active={view === n.id}
              onClick={() => setView(n.id)}
            />
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>
            {session.name}
            <small>{session.role}</small>
          </span>
          <button className="icon-button" onClick={() => setSession(null)}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <section className="content">
        <div className="topbar">
          <div className="search-wrap">
            <div className="search">
              <Search size={16} />
              <input
                aria-label="Global search"
                placeholder={
                  session.role === "Designer"
                    ? "Search my projects..."
                    : "Search leads, clients..."
                }
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            {searchQuery.trim() && session.role !== "Designer" && (
              <div className="search-results">
                {leads
                  .filter((lead) =>
                    `${lead.company} ${lead.phone} ${lead.contactName} ${lead.owner}`
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()),
                  )
                  .slice(0, 6)
                  .map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => {
                        setView("leads");
                        setSearchLeadId(lead.id);
                        setSearchQuery("");
                      }}
                    >
                      {lead.company}
                      <small>{lead.contactName || lead.phone}</small>
                    </button>
                  ))}
                {!leads.some((lead) =>
                  `${lead.company} ${lead.phone} ${lead.contactName} ${lead.owner}`
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()),
                ) && <span className="search-empty">No matches found</span>}
              </div>
            )}
          </div>
          <div className="topbar-brand display">✂ Vectrace Emb</div>
          <div className="topbar-actions">
            {session.role !== "Designer" && gmailConnection?.configured !== false && <button className={`gmail-nav-button${gmailConnection?.connected ? " connected" : ""}`} onClick={connectTopbarGmail} title={gmailConnection?.connected ? "Reconnect Gmail" : "Connect Gmail"}><Send size={14} />{gmailConnecting ? "Connecting..." : gmailConnection?.connected ? "Gmail connected" : "Connect Gmail"}</button>}
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button notification-bell" aria-label="Notifications" onClick={() => setNotificationOpen((open) => !open)}>
              <Bell size={16} />
              {notifications.some((notification) => !notification.read) && <i>{notifications.filter((notification) => !notification.read).length}</i>}
            </button>
            <button className="outline-button compact-button push-enable" onClick={enablePushNotifications}>{pushStatus === "Alerts enabled" ? "Alerts on" : "Enable alerts"}</button>
            {notificationOpen && <div className="notification-panel"><header><b>Notifications</b><small>{notifications.filter((notification) => !notification.read).length} unread</small></header>{notifications.length ? notifications.slice(0, 12).map((notification) => <button className={notification.read ? "" : "unread"} key={notification.id} onClick={async () => { if (!notification.read) { await api(`/notifications/${notification.id}/read`, session.token, { method: "POST", body: JSON.stringify({}) }); setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item)); } }}><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()}</small></button>) : <p>No notifications yet.</p>}</div>}
          </div>
        </div>
        {view === "dashboard" && (
          <Dashboard
            session={session}
            leads={leads}
            range={range}
            setRange={setRange}
          />
        )}{" "}
        {view === "leads" && (
          <LeadsView
            session={session}
            token={session.token}
            leads={leads}
            refresh={refresh}
            initialLeadId={searchLeadId}
            onInitialLeadOpened={() => setSearchLeadId(null)}
            onNewOpportunity={(lead) => {
              setOpportunityLead(lead);
              setView("new-opportunity");
            }}
          />
        )}{" "}
        {view === "opportunities" && (
          <Opportunities
            leads={leads}
            token={session.token}
            refresh={refresh}
            onNewOpportunity={(lead) => {
              setOpportunityLead(lead ?? null);
              setView("new-opportunity");
            }}
            initialLeadId={openOpportunityId}
            onOpportunityOpened={() => setOpenOpportunityId(null)}
          />
        )}{" "}
        {view === "new-opportunity" && (
          <NewOpportunityForm
            leads={leads}
            token={session.token}
            selectedLead={opportunityLead}
            onCancel={() => setView("opportunities")}
            onCreated={(leadId) => {
              setOpportunityLead(null);
              setOpenOpportunityId(leadId);
              refresh().finally(() => setView("opportunities"));
            }}
          />
        )}{" "}
        {view === "clients" && <ClientsView token={session.token} />}{" "}
        {view === "designers" && <DesignersWorkspace token={session.token} />}{" "}
        {view === "finance" && <Finance token={session.token} />}{" "}
        {view === "reports" && <Reports token={session.token} />}{" "}
        {view === "users" && <UsersView token={session.token} />}{" "}
        {view === "portal" && <Portal token={session.token} designerName={session.name} />}
      </section>
    </main>
  );
}
