import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Shield, EyeOff, Eye, Pause, Play, Trash2, RotateCcw,
  Search, Loader2, Crown, UserCog, FileX, ScrollText, Download, CheckSquare, Square,
  Inbox, Check, XCircle, ShieldAlert, Flag, BadgeCheck, Bug, Trash,
} from "lucide-react";
import { clientLog, exportLogsJson as exportClientLogsJson, exportLogsCsv as exportClientLogsCsv, type ClientLogEntry } from "@/lib/clientLog";

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_shadow_banned: boolean;
  is_suspended: boolean;
  suspended_until: string | null;
  is_deleted: boolean;
  created_at: string;
};
type ModLog = { id: string; action: string; reason: string | null; created_at: string; target_user_id: string; actor_id: string };
type AccountRequest = {
  id: string; user_id: string; request_type: "username" | "password";
  new_username: string | null; status: string; created_at: string;
  profile?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};
type Report = {
  id: string; post_id: string; reporter_id: string; category: string;
  details: string | null; status: string; created_at: string;
  post?: { id: string; content: string | null; image_url: string | null; author_id: string } | null;
  reporter?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};
type Verification = {
  id: string; user_id: string; reason: string; status: string;
  created_at: string; expires_at: string | null; note: string | null;
  profile?: { username: string | null; display_name: string | null; avatar_url: string | null; verified_until: string | null } | null;
};

const Admin = () => {
  // ── auth ────────────────────────────────────────────────────────────────────
  const { user, isOwner, isStaff, loading: authLoading } = useAuth();

  // ── ALL useState hooks must be unconditional and at the top ─────────────────
  const [rows, setRows] = useState<Row[]>([]);
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [postIdsToDelete, setPostIdsToDelete] = useState("");
  const [tab, setTab] = useState<"users" | "reports" | "verifications" | "requests" | "content" | "log" | "clientlogs">("users");
  const [clientLogs, setClientLogs] = useState<ClientLogEntry[]>([]);
  const [clientLogFilter, setClientLogFilter] = useState<"all" | "error" | "warn" | "boundary">("all");
  // null = checking, true = confirmed staff, false = not staff
  const [serverStaffVerified, setServerStaffVerified] = useState<boolean | null>(null);

  // ── data loader ─────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [u, l, rq, rp, ve] = await Promise.all([
      supabase.rpc("staff_list_profiles", { _search: null, _lim: 500 } as any),
      supabase.from("moderation_actions").select("id,action,reason,created_at,target_user_id,actor_id").order("created_at", { ascending: false }).limit(200),
      supabase.from("account_change_requests").select("id,user_id,request_type,new_username,status,created_at,profile:profiles!account_change_requests_user_id_fkey(username,display_name,avatar_url)").order("created_at", { ascending: false }).limit(200),
      supabase.from("post_reports" as any).select("id,post_id,reporter_id,category,details,status,created_at,post:posts!post_reports_post_id_fkey(id,content,image_url,author_id),reporter:profiles!post_reports_reporter_id_fkey(username,display_name,avatar_url)").order("created_at", { ascending: false }).limit(200),
      supabase.from("verification_requests" as any).select("id,user_id,reason,status,created_at,expires_at,note,profile:profiles!verification_requests_user_id_fkey(username,display_name,avatar_url,verified_until)").order("created_at", { ascending: false }).limit(200),
    ]);
    if (u.error) toast.error(u.error.message);
    setRows((u.data as any) ?? []);
    setLogs((l.data as any) ?? []);
    setRequests((rq.data as any) ?? []);
    setReports((rp.data as any) ?? []);
    setVerifications((ve.data as any) ?? []);
    setLoading(false);
  };

  // ── ALL useEffect hooks unconditional ────────────────────────────────────────

  // 1. Server-side staff check
  useEffect(() => {
    if (authLoading) return; // wait for auth to settle first
    if (!user) { setServerStaffVerified(false); return; }
    if (!isStaff) { setServerStaffVerified(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["owner", "admin", "moderator"]);
        if (cancelled) return;
        if (error) { setServerStaffVerified(false); return; }
        setServerStaffVerified(!!data && data.length > 0);
      } catch {
        if (!cancelled) setServerStaffVerified(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isStaff, authLoading]);

  // 2. Load data once staff is confirmed
  useEffect(() => {
    if (!serverStaffVerified) return;
    load();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "account_change_requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reports" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "verification_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverStaffVerified]);

  // 3. Client log subscription (owner only)
  useEffect(() => {
    if (!isOwner) return;
    const unsub = clientLog.subscribe((entries) => setClientLogs([...entries].reverse()));
    return unsub;
  }, [isOwner]);

  // ── useMemo hooks unconditional ──────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter((r) => {
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return r.username?.toLowerCase().includes(n) || r.display_name?.toLowerCase().includes(n) || r.id.toLowerCase().includes(n);
  }), [rows, q]);

  // ── NOW it is safe to do conditional returns — all hooks are above ───────────
  if (authLoading || serverStaffVerified === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isStaff || !serverStaffVerified) return <Navigate to="/" replace />;

  // ── handlers ─────────────────────────────────────────────────────────────────
  const logAction = async (action: string, targetUserId: string, reason?: string, metadata?: any) => {
    if (!user) return;
    await supabase.from("moderation_actions").insert({ actor_id: user.id, target_user_id: targetUserId, action, reason: reason ?? null, metadata: metadata ?? null } as any);
  };

  const update = async (id: string, patch: Partial<Row>, action: string, reason?: string) => {
    setBusyId(id);
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { await logAction(action, id, reason); setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as Row : r))); }
    setBusyId(null);
  };

  const toggleShadowBan = (r: Row) => update(r.id, { is_shadow_banned: !r.is_shadow_banned }, r.is_shadow_banned ? "unshadow_ban" : "shadow_ban");
  const suspend = (r: Row) => {
    const days = window.prompt("Suspend for how many days? (empty = indefinite)", "7");
    if (days === null) return;
    const until = days.trim() ? new Date(Date.now() + parseInt(days, 10) * 86400000).toISOString() : null;
    const reason = window.prompt("Reason (optional)") ?? undefined;
    update(r.id, { is_suspended: true, suspended_until: until }, "suspend", reason);
  };
  const unsuspend = (r: Row) => update(r.id, { is_suspended: false, suspended_until: null }, "unsuspend");
  const softDelete = (r: Row) => {
    if (!window.confirm(`Disable @${r.username}? They'll be locked out.`)) return;
    const reason = window.prompt("Reason (optional)") ?? undefined;
    update(r.id, { is_deleted: true, is_suspended: true }, "delete", reason);
  };
  const restore = (r: Row) => update(r.id, { is_deleted: false, is_suspended: false, suspended_until: null }, "restore");

  const permanentDelete = async (r: Row) => {
    if (!window.confirm(`PERMANENTLY delete @${r.username}? This erases the account, posts, and messages and cannot be undone.`)) return;
    const reason = window.prompt("Reason (recorded in audit log)") ?? undefined;
    setBusyId(r.id);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: r.id, reason } });
    setBusyId(null);
    if (error || (data as any)?.error) { toast.error(((data as any)?.error) || error?.message || "Delete failed"); return; }
    toast.success(`@${r.username} permanently deleted`);
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  };

  const reviewRequest = async (req: AccountRequest, action: "approve" | "deny") => {
    const note = action === "deny" ? (window.prompt("Reason for denial (optional)") ?? undefined) : undefined;
    setBusyId(req.id);
    const { data, error } = await supabase.functions.invoke("review-account-request", { body: { request_id: req.id, action, note } });
    setBusyId(null);
    if (error || (data as any)?.error) { toast.error(((data as any)?.error) || error?.message || "Review failed"); return; }
    toast.success(action === "approve" ? "Request approved and applied" : "Request denied");
    load();
  };

  const resolveReport = async (rep: Report, action: "resolved" | "dismissed", deletePost = false) => {
    setBusyId(rep.id);
    if (deletePost && rep.post_id) {
      await supabase.from("posts").delete().eq("id", rep.post_id);
      await logAction("delete_reported_post", rep.post?.author_id || rep.reporter_id, `Report ${rep.id}: ${rep.category}`, { report_id: rep.id, post_id: rep.post_id });
    }
    const { error } = await supabase.from("post_reports" as any).update({ status: action, resolved_by: user!.id, resolved_at: new Date().toISOString() }).eq("id", rep.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    await logAction(`report_${action}`, rep.post?.author_id || rep.reporter_id, rep.category, { report_id: rep.id, post_id: rep.post_id });
    toast.success(action === "resolved" ? "Report resolved" : "Report dismissed");
    load();
  };

  const reviewVerification = async (v: Verification, action: "approve" | "deny") => {
    let expires_at: string | null = null;
    let note: string | null = null;
    if (action === "approve") {
      const choice = window.prompt("Verification duration:\n  - Type a number of months (e.g. 12)\n  - Leave EMPTY for lifetime", "12");
      if (choice === null) return;
      if (choice.trim()) {
        const months = parseInt(choice.trim(), 10);
        if (isNaN(months) || months < 1 || months > 240) { toast.error("Enter 1-240 or empty"); return; }
        const d = new Date(); d.setMonth(d.getMonth() + months);
        expires_at = d.toISOString();
      }
    } else {
      note = window.prompt("Reason for denial (optional)") ?? null;
    }
    setBusyId(v.id);
    const patch: any = { status: action === "approve" ? "approved" : "denied", decided_by: user!.id, decided_at: new Date().toISOString(), expires_at, note };
    const { error } = await supabase.from("verification_requests" as any).update(patch).eq("id", v.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    await logAction(`verification_${action}`, v.user_id, action === "deny" ? (note || undefined) : (expires_at ? `expires ${expires_at}` : "lifetime"), { verification_id: v.id });
    toast.success(action === "approve" ? "Badge granted" : "Verification denied");
    load();
  };

  const promote = async (r: Row, roleToGrant: "moderator" | "admin") => {
    if (!isOwner) { toast.error("Only the owner can change roles"); return; }
    setBusyId(r.id);
    const { error } = await supabase.from("user_roles").insert({ user_id: r.id, role: roleToGrant });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    await logAction(`promote_${roleToGrant}`, r.id);
    toast.success(`Granted ${roleToGrant}`);
  };

  const demote = async (r: Row) => {
    if (!isOwner) { toast.error("Only the owner can change roles"); return; }
    setBusyId(r.id);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", r.id).in("role", ["admin", "moderator"]);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    await logAction("revoke_roles", r.id);
    toast.success("Roles revoked");
  };

  const bulkDeletePosts = async () => {
    const ids = postIdsToDelete.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!ids.length) { toast.error("Paste at least one post ID"); return; }
    if (!window.confirm(`Permanently delete ${ids.length} post(s)?`)) return;
    const { error, count } = await supabase.from("posts").delete({ count: "exact" }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted ${count ?? ids.length} post(s)`);
    setPostIdsToDelete("");
  };

  const toggleSelect = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  const bulkAction = async (action: "suspend" | "unsuspend" | "shadow" | "unshadow" | "delete" | "restore") => {
    if (!selected.size) return;
    const ids = [...selected].filter((id) => id !== user?.id);
    if (!ids.length) return;
    if (action === "delete" && !window.confirm(`Disable ${ids.length} account(s)?`)) return;
    const patch: Partial<Row> =
      action === "suspend" ? { is_suspended: true }
      : action === "unsuspend" ? { is_suspended: false, suspended_until: null }
      : action === "shadow" ? { is_shadow_banned: true }
      : action === "unshadow" ? { is_shadow_banned: false }
      : action === "delete" ? { is_deleted: true, is_suspended: true }
      : { is_deleted: false, is_suspended: false, suspended_until: null };
    const { error } = await supabase.from("profiles").update(patch).in("id", ids);
    if (error) { toast.error(error.message); return; }
    await supabase.from("moderation_actions").insert(ids.map((id) => ({ actor_id: user!.id, target_user_id: id, action: `bulk_${action}`, reason: null })));
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...patch } as Row : r)));
    toast.success(`${action} applied to ${ids.length} users`);
    clearSelection();
  };

  const exportLogsCsv = () => {
    const header = ["id", "action", "target_user_id", "actor_id", "reason", "created_at"];
    const escape = (v: any) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header.join(","), ...logs.map((l) => header.map((h) => escape((l as any)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${logs.length} entries`);
  };

  // ── derived counts ───────────────────────────────────────────────────────────
  const pendingReports = reports.filter((r) => r.status === "open").length;
  const pendingVerifications = verifications.filter((v) => v.status === "pending").length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const clientErrCount = clientLogs.filter((l) => l.level === "error" || l.level === "boundary").length;
  const filteredClientLogs = clientLogs.filter((l) => clientLogFilter === "all" || l.level === clientLogFilter);

  const tabs = [
    { id: "users", label: "Users", icon: UserCog, badge: 0 },
    { id: "reports", label: "Reports", icon: Flag, badge: pendingReports },
    { id: "verifications", label: "Verifications", icon: BadgeCheck, badge: pendingVerifications },
    { id: "requests", label: "Requests", icon: Inbox, badge: pendingRequests },
    { id: "content", label: "Content", icon: FileX, badge: 0 },
    { id: "log", label: "Audit log", icon: ScrollText, badge: 0 },
    ...(isOwner ? [{ id: "clientlogs", label: "Client logs", icon: Bug, badge: clientErrCount }] : []),
  ] as const;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" /> Owner Console
                {isOwner && <Crown className="w-5 h-5 text-yellow-400" />}
              </h1>
              <p className="text-sm text-muted-foreground">Full control over accounts, content, and roles.</p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-5 bg-card border border-border rounded-xl p-1 w-fit overflow-x-auto max-w-full">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {label}
              {badge > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === id ? "bg-primary-foreground/20" : "bg-destructive/20 text-destructive"}`}>{badge}</span>}
            </button>
          ))}
        </div>

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

        {/* Users */}
        {!loading && tab === "users" && (
          <>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, @username, or id…"
                className="bg-secondary text-sm pl-9 pr-3 py-2 rounded-xl outline-none w-full max-w-md focus:ring-2 focus:ring-primary/30" />
            </div>
            {selected.size > 0 && (
              <div className="mb-3 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl p-2 flex-wrap">
                <span className="text-xs font-semibold text-primary px-2">{selected.size} selected</span>
                <button onClick={() => bulkAction("suspend")} className="text-xs px-2.5 py-1 rounded-md bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30">Suspend</button>
                <button onClick={() => bulkAction("unsuspend")} className="text-xs px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/70">Unsuspend</button>
                <button onClick={() => bulkAction("shadow")} className="text-xs px-2.5 py-1 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">Shadow ban</button>
                <button onClick={() => bulkAction("unshadow")} className="text-xs px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/70">Unshadow</button>
                <button onClick={() => bulkAction("delete")} className="text-xs px-2.5 py-1 rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30">Delete</button>
                <button onClick={() => bulkAction("restore")} className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30">Restore</button>
                <button onClick={clearSelection} className="text-xs px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground ml-auto">Clear</button>
              </div>
            )}
            <div className="mb-2 text-xs text-muted-foreground">
              <button onClick={selectAllFiltered} className="hover:text-foreground">Select all ({filtered.length})</button>
            </div>
            <div className="space-y-2">
              {filtered.map((r) => {
                const status = r.is_deleted ? { label: "Deleted", cls: "bg-destructive/15 text-destructive" }
                  : r.is_suspended ? { label: "Suspended", cls: "bg-yellow-500/15 text-yellow-400" }
                  : r.is_shadow_banned ? { label: "Shadow banned", cls: "bg-purple-500/15 text-purple-400" }
                  : { label: "Active", cls: "bg-emerald-500/15 text-emerald-400" };
                const isSel = selected.has(r.id);
                return (
                  <div key={r.id} className="bg-card border border-border rounded-2xl p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                    <button onClick={() => toggleSelect(r.id)} className="text-muted-foreground hover:text-primary">
                      {isSel ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
                    </button>
                    <img src={r.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.id}`} alt="" className="w-10 h-10 rounded-full object-cover bg-secondary" />
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-semibold text-sm truncate">{r.display_name || r.username}</div>
                      <div className="text-xs text-muted-foreground truncate">@{r.username}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                    <div className="flex items-center gap-1 ml-auto flex-wrap">
                      <button onClick={() => toggleShadowBan(r)} disabled={busyId === r.id || r.is_deleted} title={r.is_shadow_banned ? "Lift shadow ban" : "Shadow ban"} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40">
                        {r.is_shadow_banned ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      {r.is_suspended && !r.is_deleted
                        ? <button onClick={() => unsuspend(r)} disabled={busyId === r.id} title="Lift suspension" className="p-2 rounded-lg hover:bg-secondary text-yellow-400 disabled:opacity-40"><Play className="w-4 h-4" /></button>
                        : <button onClick={() => suspend(r)} disabled={busyId === r.id || r.is_deleted} title="Suspend" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"><Pause className="w-4 h-4" /></button>
                      }
                      {r.is_deleted
                        ? <button onClick={() => restore(r)} disabled={busyId === r.id} title="Restore" className="p-2 rounded-lg hover:bg-secondary text-emerald-400 disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>
                        : <button onClick={() => softDelete(r)} disabled={busyId === r.id || r.id === user?.id} title="Delete account" className="p-2 rounded-lg hover:bg-destructive/15 text-destructive disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                      }
                      {isOwner && r.id !== user?.id && (
                        <>
                          <button onClick={() => promote(r, "moderator")} disabled={busyId === r.id} title="Grant moderator" className="px-2 py-1 text-[10px] rounded-md bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary">MOD</button>
                          <button onClick={() => promote(r, "admin")} disabled={busyId === r.id} title="Grant admin" className="px-2 py-1 text-[10px] rounded-md bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary">ADMIN</button>
                          <button onClick={() => demote(r)} disabled={busyId === r.id} title="Revoke roles" className="px-2 py-1 text-[10px] rounded-md bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive">REVOKE</button>
                          <button onClick={() => permanentDelete(r)} disabled={busyId === r.id} title="Permanently delete" className="p-2 rounded-lg hover:bg-destructive/20 text-destructive disabled:opacity-40"><ShieldAlert className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No users match.</p>}
            </div>
          </>
        )}

        {/* Reports */}
        {!loading && tab === "reports" && (
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs text-muted-foreground mb-2">User-submitted reports. Resolve to hide, dismiss if invalid, or delete the post directly.</p>
            {reports.length === 0 && <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">No reports yet.</div>}
            {reports.map((r) => {
              const open = r.status === "open";
              return (
                <div key={r.id} className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <span className="text-xs font-semibold text-destructive uppercase bg-destructive/10 px-2 py-1 rounded-md">{r.category}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${open ? "bg-yellow-500/15 text-yellow-400" : r.status === "resolved" ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>{r.status}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-3">
                    {r.post?.image_url && <img src={r.post.image_url} alt="Reported" className="w-16 h-16 rounded-lg object-cover border border-border shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">{r.post?.content || <span className="italic text-muted-foreground">(no text)</span>}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Reported by <strong>@{r.reporter?.username || r.reporter_id.slice(0, 8)}</strong>{" · post id "}<code className="text-[10px]">{r.post_id.slice(0, 8)}…</code></p>
                      {r.details && <p className="text-xs text-foreground/70 italic mt-1">"{r.details}"</p>}
                    </div>
                  </div>
                  {open && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button onClick={() => resolveReport(r, "resolved", true)} disabled={busyId === r.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /> Delete post & resolve</button>
                      <button onClick={() => resolveReport(r, "resolved", false)} disabled={busyId === r.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Resolve (keep post)</button>
                      <button onClick={() => resolveReport(r, "dismissed", false)} disabled={busyId === r.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-secondary/70 text-muted-foreground disabled:opacity-40"><XCircle className="w-3.5 h-3.5" /> Dismiss</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Verifications */}
        {!loading && tab === "verifications" && (
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs text-muted-foreground mb-2">Users who applied for a verified badge.</p>
            {verifications.length === 0 && <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">No verification requests yet.</div>}
            {verifications.map((v) => {
              const pending = v.status === "pending";
              return (
                <div key={v.id} className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <img src={v.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.user_id}`} alt="" className="w-10 h-10 rounded-full object-cover bg-secondary" />
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-semibold text-sm truncate flex items-center gap-1">
                        {v.profile?.display_name || v.profile?.username || v.user_id.slice(0, 8)}
                        {v.profile?.verified_until && new Date(v.profile.verified_until).getTime() > Date.now() && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{v.profile?.username}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${pending ? "bg-yellow-500/15 text-yellow-400" : v.status === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"}`}>{v.status}</span>
                    <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground/90 bg-secondary/50 border border-border rounded-lg p-3 whitespace-pre-wrap">{v.reason}</p>
                  {v.expires_at && v.status === "approved" && <p className="text-[11px] text-emerald-400 mt-2">Badge valid until {new Date(v.expires_at).toLocaleDateString()}</p>}
                  {v.note && !pending && <p className="text-[11px] text-muted-foreground italic mt-2">Owner note: {v.note}</p>}
                  {pending && (
                    <div className="flex items-center gap-1 mt-3">
                      <button onClick={() => reviewVerification(v, "approve")} disabled={busyId === v.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"><BadgeCheck className="w-3.5 h-3.5" /> Approve</button>
                      <button onClick={() => reviewVerification(v, "deny")} disabled={busyId === v.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-40"><XCircle className="w-3.5 h-3.5" /> Deny</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Requests */}
        {!loading && tab === "requests" && (
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs text-muted-foreground mb-2">Users can request username or password changes from their profile settings.</p>
            {requests.length === 0 && <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">No account change requests yet.</div>}
            {requests.map((req) => {
              const pending = req.status === "pending";
              return (
                <div key={req.id} className="bg-card border border-border rounded-2xl p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                  <img src={req.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.user_id}`} alt="" className="w-10 h-10 rounded-full object-cover bg-secondary" />
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-sm truncate">{req.profile?.display_name || req.profile?.username || req.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground truncate">wants to change <strong className="text-foreground">{req.request_type}</strong>{req.request_type === "username" && req.new_username && <> to <code className="text-primary">@{req.new_username}</code></>}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(req.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${pending ? "bg-yellow-500/15 text-yellow-400" : req.status === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"}`}>{req.status}</span>
                  {pending && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => reviewRequest(req, "approve")} disabled={busyId === req.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Approve</button>
                      <button onClick={() => reviewRequest(req, "deny")} disabled={busyId === req.id} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-40"><XCircle className="w-3.5 h-3.5" /> Deny</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Content */}
        {!loading && tab === "content" && (
          <div className="bg-card border border-border rounded-2xl p-5 max-w-2xl">
            <h2 className="font-semibold mb-2">Bulk-remove posts</h2>
            <p className="text-xs text-muted-foreground mb-3">Paste one or more post IDs (separated by comma, space, or newline). Deletion is permanent.</p>
            <textarea value={postIdsToDelete} onChange={(e) => setPostIdsToDelete(e.target.value)} rows={5} placeholder={"post-id-1\npost-id-2, post-id-3"} className="w-full bg-secondary text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            <div className="mt-3 flex justify-end">
              <button onClick={bulkDeletePosts} className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg font-semibold hover:opacity-90">Delete selected</button>
            </div>
          </div>
        )}

        {/* Audit log */}
        {!loading && tab === "log" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">Showing {logs.length} most recent actions</p>
              <button onClick={exportLogsCsv} disabled={!logs.length} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"><Download className="w-4 h-4" /> Export CSV</button>
            </div>
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="bg-card border border-border rounded-xl p-3 text-sm flex items-center gap-3 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary font-mono">{l.action}</span>
                  <span className="text-muted-foreground text-xs">target <code>{l.target_user_id?.slice(0, 8)}…</code></span>
                  {l.reason && <span className="text-foreground/80 italic">"{l.reason}"</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No moderation actions yet.</p>}
            </div>
          </>
        )}

        {/* Client logs (owner only) */}
        {!loading && tab === "clientlogs" && isOwner && (
          <>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">Live · {clientLogs.length} entries ({clientErrCount} errors)</p>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
                  {(["all", "error", "boundary", "warn"] as const).map((f) => (
                    <button key={f} onClick={() => setClientLogFilter(f)} className={`text-[11px] px-2 py-1 rounded-md capitalize ${clientLogFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => exportClientLogsJson(clientLogs)} disabled={!clientLogs.length} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"><Download className="w-4 h-4" /> JSON</button>
                <button onClick={() => exportClientLogsCsv(clientLogs)} disabled={!clientLogs.length} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"><Download className="w-4 h-4" /> CSV</button>
                <button onClick={() => { clientLog.clear(); toast.success("Client logs cleared"); }} disabled={!clientLogs.length} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40"><Trash className="w-4 h-4" /> Clear</button>
              </div>
            </div>
            <div className="space-y-2">
              {filteredClientLogs.map((l) => {
                const tone = l.level === "boundary" ? "border-destructive/50 bg-destructive/5" : l.level === "error" ? "border-destructive/30" : l.level === "warn" ? "border-yellow-500/30" : "border-border";
                const badgeTone = l.level === "boundary" ? "bg-destructive/20 text-destructive" : l.level === "error" ? "bg-destructive/15 text-destructive" : l.level === "warn" ? "bg-yellow-500/15 text-yellow-500" : "bg-primary/10 text-primary";
                return (
                  <div key={l.id} className={`bg-card border rounded-xl p-3 text-sm space-y-1 ${tone}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono uppercase ${badgeTone}`}>{l.level}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{l.source}</span>
                      {l.url && <span className="text-[11px] text-muted-foreground">· {l.url}</span>}
                      <span className="ml-auto text-[11px] text-muted-foreground">{new Date(l.ts).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap">{l.message}</p>
                    {l.stack && (
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">stack trace</summary>
                        <pre className="mt-1 p-2 rounded-lg bg-secondary/50 overflow-x-auto text-muted-foreground">{l.stack}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
              {filteredClientLogs.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No client-side {clientLogFilter === "all" ? "" : clientLogFilter} events captured yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;
