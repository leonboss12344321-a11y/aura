import { useState, useEffect } from "react";
import ChatList from "./ChatList";
import ChatWindow from "./ChatWindow";
import NewChatDialog from "./NewChatDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { MessageCircle, Loader2 } from "lucide-react";
import { ensureUserKeypair, ensureConversationKey } from "@/lib/crypto";

export interface ConversationWithParticipant {
  id: string;
  participant: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    is_online: boolean | null;
  };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

const MessagesView = () => {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const { user } = useAuth();
  const { pendingConversationId, clearPendingConversation } = useNav();

  const fetchConversations = async () => {
    if (!user) return;
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    if (!participations?.length) { setConversations([]); setLoading(false); return; }

    const convIds = participations.map((p) => p.conversation_id);
    const lastReadMap = new Map(participations.map((p: any) => [p.conversation_id, p.last_read_at]));

    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id, profiles!conversation_participants_user_id_fkey(id, display_name, username, avatar_url, is_online)")
      .in("conversation_id", convIds)
      .neq("user_id", user.id);

    const { data: lastMessages } = await supabase
      .from("messages")
      .select("conversation_id, content, encrypted_content, image_url, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    const lastMsgMap = new Map<string, any>();
    const unreadMap = new Map<string, number>();
    lastMessages?.forEach((m: any) => {
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
      const lr = lastReadMap.get(m.conversation_id);
      if (m.sender_id !== user.id && lr && new Date(m.created_at) > new Date(lr)) {
        unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) || 0) + 1);
      }
    });

    const convs: ConversationWithParticipant[] = (allParticipants || []).map((p: any) => {
      const last = lastMsgMap.get(p.conversation_id);
      let preview = "No messages yet";
      if (last) {
        if (last.image_url) preview = "📷 Photo";
        else if (last.encrypted_content) preview = "🔒 Encrypted message";
        else if (last.content) preview = last.content;
      }
      return {
        id: p.conversation_id,
        participant: p.profiles,
        lastMessage: preview,
        lastMessageAt: last?.created_at || "",
        unreadCount: unreadMap.get(p.conversation_id) || 0,
      };
    });

    convs.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
    setConversations(convs);
    setLoading(false);
  };

  useEffect(() => {
    if (user) ensureUserKeypair(user.id).catch(console.error);
    fetchConversations();

    if (!user) return;
    const ch = supabase
      .channel(`messages-list-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchConversations())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // When opened from a profile, select that conversation
  useEffect(() => {
    if (!pendingConversationId) return;
    (async () => {
      await fetchConversations();
      setActiveConvId(pendingConversationId);
      clearPendingConversation();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConversationId]);

  const markConvRead = async (convId: string) => {
    if (!user) return;
    await supabase.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", convId).eq("user_id", user.id);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
  };

  const handleSelect = (id: string) => {
    setActiveConvId(id);
    markConvRead(id);
  };

  const handleNewConversation = async (otherUserId: string) => {
    if (!user) return;
    const existing = conversations.find((c) => c.participant.id === otherUserId);
    if (existing) {
      setActiveConvId(existing.id);
      setShowNewChat(false);
      return;
    }

    const { data: conv } = await supabase.from("conversations").insert({ created_by: user.id } as any).select().single();
    if (!conv) return;

    await supabase.from("conversation_participants").insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);

    // Establish encryption key for the conversation immediately
    try {
      await ensureUserKeypair(user.id);
      await ensureConversationKey(conv.id, user.id, [otherUserId]);
    } catch (e) {
      console.error("Failed to provision conversation key", e);
    }

    await fetchConversations();
    setActiveConvId(conv.id);
    setShowNewChat(false);
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-6rem)] md:h-[calc(100dvh-2rem)] max-w-4xl mx-auto flex flex-col">
      <h1 className="text-2xl font-bold text-foreground tracking-tight mb-3 md:mb-4 shrink-0">Messages</h1>
      <div className="flex flex-1 min-h-0 bg-card border border-border rounded-2xl overflow-hidden">
        <div className={`w-full lg:w-80 border-r border-border shrink-0 ${activeConvId ? "hidden lg:block" : ""}`}>
          <ChatList
            conversations={conversations}
            activeConversationId={activeConvId}
            onSelect={handleSelect}
            onNewChat={() => setShowNewChat(true)}
            onConversationDeleted={(id) => {
              setConversations((prev) => prev.filter((c) => c.id !== id));
              if (activeConvId === id) setActiveConvId(null);
            }}
          />
        </div>

        <div className={`flex-1 min-w-0 ${!activeConvId ? "hidden lg:flex" : "flex"}`}>
          {activeConv ? (
            <div className="flex-1 min-w-0">
              <ChatWindow conversation={activeConv} onBack={() => setActiveConvId(null)} onMessageSent={fetchConversations} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-foreground font-semibold">Select a conversation</p>
                <p className="text-sm text-muted-foreground mt-1">Choose someone to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <NewChatDialog onSelect={handleNewConversation} onClose={() => setShowNewChat(false)} />
      )}
    </div>
  );
};

export default MessagesView;
