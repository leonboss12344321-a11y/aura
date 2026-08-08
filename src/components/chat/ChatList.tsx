import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ConversationWithParticipant } from "./MessagesView";
import { Search, PenSquare, Lock, X, Trash2, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatListProps {
  conversations: ConversationWithParticipant[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onConversationDeleted?: (id: string) => void;
}

const formatTime = (dateStr: string) => {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const ChatList = ({ conversations, activeConversationId, onSelect, onNewChat, onConversationDeleted }: ChatListProps) => {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const q = query.trim().toLowerCase();
  const visible = conversations.filter((c) => !hiddenIds.has(c.id));
  const filtered = !q
    ? visible
    : visible.filter((c) =>
        c.participant.display_name?.toLowerCase().includes(q) ||
        c.participant.username?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q),
      );
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
  );

  const requestDelete = (id: string, name: string) => {
    setMenuId(null);
    setPendingDelete({ id, name });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    setPendingDelete(null);
    // optimistic hide
    setHiddenIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(async () => {
      timersRef.current.delete(id);
      setDeletingId(id);
      const { error } = await supabase.rpc("delete_conversation", { _conversation_id: id });
      setDeletingId(null);
      if (error) {
        toast.error(error.message);
        setHiddenIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        return;
      }
      onConversationDeleted?.(id);
    }, 5000);
    timersRef.current.set(id, timer);
    toast(`Conversation with ${name} deleted`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          const t = timersRef.current.get(id);
          if (t) { clearTimeout(t); timersRef.current.delete(id); }
          setHiddenIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        },
      },
    });
  };


  return (
    <div className="flex flex-col h-full" onClick={() => setMenuId(null)}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Messages</h2>
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              <Lock className="w-3 h-3" /> Secure
            </span>
          </div>
          <button onClick={onNewChat} aria-label="Start a new conversation" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
            <PenSquare className="w-5 h-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full bg-secondary text-foreground text-sm pl-9 pr-9 py-2 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sorted.map((conv) => {
          const open = menuId === conv.id;
          return (
            <div key={conv.id} className={cn(
              "relative group flex items-center gap-2 hover:bg-secondary/50 transition-colors",
              activeConversationId === conv.id && "bg-secondary",
              deletingId === conv.id && "opacity-50",
            )}>
              <button
                onClick={() => onSelect(conv.id)}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className="relative shrink-0">
                  <img src={conv.participant.avatar_url || ""} alt={conv.participant.display_name} className="w-11 h-11 rounded-full object-cover" />
                  {conv.participant.is_online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-sm truncate text-foreground">
                      {conv.participant.display_name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-xs truncate", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {conv.lastMessage}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <div className="relative pr-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuId(open ? null : conv.id); }}
                  aria-label="Conversation options"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {open && (
                  <div className="absolute right-2 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-20 min-w-[160px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); requestDelete(conv.id, conv.participant.display_name); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete conversation
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {q ? `No conversations match "${query}"` : "No conversations yet"}
            </p>
            {!q && (
              <button onClick={onNewChat} className="text-sm text-primary font-semibold mt-2 hover:underline">
                Start a conversation
              </button>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the entire chat with {pendingDelete?.name} for both of you. You'll have 5 seconds to undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatList;
