import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Mapping of notification `type` → human-readable push text
// ---------------------------------------------------------------------------
const NOTIF_TEXT: Record<string, { title: string; body: (actor?: string) => string }> = {
  like: { title: "New like", body: (a) => `${a ?? "Someone"} liked your post` },
  comment: { title: "New comment", body: (a) => `${a ?? "Someone"} commented on your post` },
  follow: { title: "New follower", body: (a) => `${a ?? "Someone"} started following you` },
  share: { title: "Post shared", body: (a) => `${a ?? "Someone"} shared your post` },
  message: { title: "New message", body: (a) => `${a ?? "Someone"} sent you a message` },
  mention: { title: "You were mentioned", body: (a) => `${a ?? "Someone"} mentioned you` },
  password_changed: { title: "Password change approved", body: () => "Your password change request was approved" },
  username_changed: { title: "Username change approved", body: () => "Your username change request was approved" },
  request_denied: { title: "Request denied", body: () => "Your account change request was denied" },
  verification_approved: { title: "Verified! 🎉", body: () => "Your verification badge has been approved" },
  verification_denied: { title: "Verification denied", body: () => "Your verification request was denied" },
};

// ---------------------------------------------------------------------------
// Register service worker once per page load
// ---------------------------------------------------------------------------
async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("[push] SW registration failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request browser Notification permission (idempotent)
// ---------------------------------------------------------------------------
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// ---------------------------------------------------------------------------
// Show a local browser notification (no server push required)
// ---------------------------------------------------------------------------
function showLocalNotification(title: string, body: string, url = "/") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: `connect-aura-${Date.now()}`,
  });
  n.onclick = () => {
    window.focus();
    n.close();
    if (url !== window.location.pathname) window.location.href = url;
  };
}

// ---------------------------------------------------------------------------
// usePushNotifications
// Subscribes to real-time notifications for the current user via Supabase
// Realtime and fires local browser notifications for each new row.
// ---------------------------------------------------------------------------
export function usePushNotifications() {
  const { user } = useAuth();
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  // Register SW on mount
  useEffect(() => {
    registerSW().then((reg) => { swRef.current = reg; });
  }, []);

  const requestPermission = useCallback(async () => {
    return requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`push-notifs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // Don't show if tab is visible/focused
          if (!document.hidden && document.hasFocus()) return;

          const notif = payload.new as {
            type: string;
            actor_id?: string | null;
          };

          // Optionally fetch actor display_name for the notification body
          let actorName: string | undefined;
          if (notif.actor_id) {
            const { data } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", notif.actor_id)
              .single();
            actorName = (data as any)?.display_name ?? undefined;
          }

          const meta = NOTIF_TEXT[notif.type] ?? {
            title: "New notification",
            body: (a?: string) => `${a ?? "Someone"} sent you a notification`,
          };

          await requestNotificationPermission();
          showLocalNotification(meta.title, meta.body(actorName), "/");
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return { requestPermission };
}

export default usePushNotifications;
