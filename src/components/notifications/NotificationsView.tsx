import { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, UserPlus, Repeat2, Bell, CheckCheck, ShieldCheck, ShieldX, KeyRound, AtSign, BadgeCheck, BellOff, BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { toast } from "sonner";
import { usePushNotifications, requestNotificationPermission } from "@/hooks/usePushNotifications";

interface Notif {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  actor: { id: string; display_name: string; username: string; avatar_url: string | null } | null;
}

const iconMap: Record<string, { icon: any; color: string; label: string }> = {
  like: { icon: Heart, color: "text-red-500 bg-red-500/10", label: "liked your post" },
  comment: { icon: MessageCircle, color: "text-primary bg-primary/10", label: "commented on your post" },
  follow: { icon: UserPlus, color: "text-accent bg-accent/10", label: "started following you" },
  share: { icon: Repeat2, color: "text-green-500 bg-green-500/10", label: "shared your post" },
  message: { icon: MessageCircle, color: "text-primary bg-primary/10", label: "sent you a message" },
  mention: { icon: Bell, color: "text-yellow-500 bg-yellow-500/10", label: "mentioned you" },
  password_changed: { icon: KeyRound, color: "text-emerald-400 bg-emerald-500/10", label: "approved your password change" },
  username_changed: { icon: AtSign, color: "text-emerald-400 bg-emerald-500/10", label: "approved your username change" },
  request_denied: { icon: ShieldX, color: "text-destructive bg-destructive/10", label: "denied your account change request" },
  verification_approved: { icon: BadgeCheck, color: "text-primary bg-primary/10", label: "approved your verification badge" },
  verification_denied: { icon: ShieldX, color: "text-destructive bg-destructive/10", label: "denied your verification request" },
};

const formatTime = (s: string) => {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const dayBucket = (s: string) => {
  const d = new Date(s);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  if (dd.getTime() === today.getTime()) return "Today";
  if (dd.getTime() === yesterday.getTime()) return "Yesterday";
  if (Date.now() - d.getTime() < 7 * 86400000) return "This week";
  return "Earlier";
};

const NotificationsView = () => {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushGranted, setPushGranted] = useState<boolean>(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const { user } = useAuth();
  const { openProfile } = useNav();
  usePushNotifications();

  const enablePush = async () => {
    const ok = await requestNotificationPermission();
    setPushGranted(ok);
    if (ok) toast.success("Push notifications enabled!");
    else toast.error("Notification permission denied. Allow it in your browser settings.");
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, created_at, read_at, actor:profiles!notifications_actor_id_fkey(id, display_name, username, avatar_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    setItems((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    const unread = items.filter((n) => !n.read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    // optimistic
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) { toast.error(error.message); load(); }
  };

  const markOneRead = async (n: Notif) => {
    if (n.read_at || !user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
    await supabase.from("notifications").update({ read_at: now }).eq("id", n.id);
  };

  const unreadCount = items.filter((n) => !n.read_at).length;

  const groups = useMemo(() => {
    const order = ["Today", "Yesterday", "This week", "Earlier"];
    const map = new Map<string, Notif[]>();
    for (const n of items) {
      const k = dayBucket(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)! }));
  }, [items]);

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Notifications {unreadCount > 0 && <span className="text-sm font-medium text-primary">({unreadCount} new)</span>}
        </h1>
        <div className="flex items-center gap-2">
          {!pushGranted && typeof Notification !== "undefined" && Notification.permission !== "denied" && (
            <button
              onClick={enablePush}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors"
              title="Enable push notifications"
            >
              <BellRing className="w-4 h-4" /> Enable alerts
            </button>
          )}
          {pushGranted && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 px-2 py-1 rounded-lg bg-emerald-500/10">
              <Bell className="w-3.5 h-3.5" /> Alerts on
            </span>
          )}
          {typeof Notification !== "undefined" && Notification.permission === "denied" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary">
              <BellOff className="w-3.5 h-3.5" /> Blocked in browser
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">You're all caught up.</div>
      )}

      {!loading && groups.map((g) => (
        <div key={g.key}>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-2 mb-2">{g.key}</div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {g.items.map((n) => {
              const meta = iconMap[n.type] || iconMap.like;
              const Icon = meta.icon;
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  onClick={() => { markOneRead(n); if (n.actor) openProfile(n.actor.id); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${
                    unread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/30"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {n.actor?.avatar_url && (
                    <img src={n.actor.avatar_url} alt={n.actor.display_name} className="w-9 h-9 rounded-full object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <strong>{n.actor?.display_name || "Someone"}</strong>{" "}
                      <span className="text-muted-foreground">{meta.label}</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatTime(n.created_at)}</span>
                  {unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="unread" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationsView;
