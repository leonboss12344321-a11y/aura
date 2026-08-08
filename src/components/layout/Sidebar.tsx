import { Home, MessageCircle, Search, Bell, User, PlusCircle, LogOut, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: "feed", label: "Feed", icon: Home },
  { id: "search", label: "Explore", icon: Search },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "notifications", label: "Alerts", icon: Bell },
  { id: "profile", label: "Profile", icon: User },
];

const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const { profile, signOut, isStaff, user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const refreshCounts = async () => {
    if (!user) return;
    // Unread messages
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);
    if (!parts?.length) { setUnreadMessages(0); }
    else {
      let total = 0;
      for (const p of parts) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .neq("sender_id", user.id)
          .gt("created_at", (p as any).last_read_at);
        total += count || 0;
      }
      setUnreadMessages(total);
    }
    // Unread notifications
    const { count: notifCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    setUnreadNotifications(notifCount || 0);
  };

  useEffect(() => {
    if (!user) return;
    refreshCounts();
    const ch = supabase
      .channel(`sidebar-counts-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refreshCounts)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshCounts)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshCounts)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, refreshCounts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  const handleSignOut = async () => { await signOut(); toast.success("Signed out"); };

  const badgeFor = (id: string) => {
    if (id === "messages" && unreadMessages > 0) return unreadMessages;
    if (id === "notifications" && unreadNotifications > 0) return unreadNotifications;
    return 0;
  };

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] lg:w-[240px] bg-sidebar border-r border-sidebar-border flex-col z-50">
        <div className="h-16 flex items-center px-5 lg:px-6">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center glow-primary">
            <span className="text-primary-foreground font-bold text-lg">S</span>
          </div>
          <span className="hidden lg:block ml-3 font-bold text-lg text-foreground tracking-tight">Aura</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const badge = badgeFor(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-label={`Go to ${item.label}${badge ? ` (${badge} unread)` : ""}`}
                aria-current={activeTab === item.id ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                  activeTab === item.id ? "bg-primary/10 text-primary glow-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <div className="relative shrink-0">
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-sidebar">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <span className="hidden lg:block">{item.label}</span>
              </button>
            );
          })}
          {isStaff && (
            <Link to="/admin" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary">
              <Shield className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="hidden lg:block">Owner Console</span>
            </Link>
          )}
        </nav>

        <div className="px-3 pb-3">
          <button onClick={() => onTabChange("feed")} aria-label="Create a new post"
            className="w-full flex items-center justify-center lg:justify-start gap-2 bg-primary text-primary-foreground py-2.5 px-4 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity glow-primary">
            <PlusCircle className="w-5 h-5" aria-hidden="true" />
            <span className="hidden lg:block">New Post</span>
          </button>
        </div>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <img src={profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"}
              alt={profile?.display_name ? `${profile.display_name} profile photo` : "Your profile photo"}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-primary/30" />
            <div className="hidden lg:block text-left flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{profile?.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">@{profile?.username}</p>
            </div>
            <button onClick={handleSignOut} aria-label="Sign out of your account"
              className="hidden lg:block text-muted-foreground hover:text-destructive transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-sidebar/95 backdrop-blur border-b border-sidebar-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">S</span>
          </div>
          <span className="font-bold text-foreground">Aura</span>
        </div>
        <div className="flex items-center gap-1">
          {isStaff && (
            <Link to="/admin" aria-label="Owner console" className="p-2 rounded-lg text-muted-foreground hover:text-primary">
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <button onClick={handleSignOut} aria-label="Sign out" className="p-2 rounded-lg text-muted-foreground hover:text-destructive">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar/95 backdrop-blur border-t border-sidebar-border z-40 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const badge = badgeFor(item.id);
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-sidebar">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
