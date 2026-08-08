import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, ArrowLeft, Video, Phone, Image as ImageIcon, Download, Lock, Loader2, Check, CheckCheck, Trash2, MoreVertical, ArrowDown } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { ConversationWithParticipant } from "./MessagesView";
import { cn } from "@/lib/utils";
import VideoCallModal from "./VideoCallModal";
import { compressImage } from "@/lib/imageCompression";
import { validateImageFile } from "@/lib/uploadValidation";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface ChatWindowProps {
  conversation: ConversationWithParticipant;
  onBack?: () => void;
  onMessageSent?: () => void;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  is_legacy_encrypted?: boolean;
}

const PAGE_SIZE = 30;

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const decodeRow = (row: any): ChatMessage => {
  let text = "";
  let legacy = false;
  if (row.content) text = row.content;
  else if (row.encrypted_content) { text = "🔒 Legacy encrypted message"; legacy = true; }
  return {
    id: row.id,
    sender_id: row.sender_id,
    text,
    image_url: row.image_url,
    created_at: row.created_at,
    is_legacy_encrypted: legacy,
  };
};

const ChatWindow = ({ conversation, onBack, onMessageSent }: ChatWindowProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [callAudioOnly, setCallAudioOnly] = useState(false);
  const [incomingCall, setIncomingCall] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerLastRead, setPeerLastRead] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const peerTypingTimeoutRef = useRef<any>(null);
  const initialLoadRef = useRef(true);
  const { user } = useAuth();
  const { openProfile } = useNav();

  const fetchInitial = async () => {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, content, encrypted_content, iv, image_url, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const rows = (data || []).map(decodeRow).reverse();
    setMessages(rows);
    setHasMore((data?.length || 0) === PAGE_SIZE);
    if (user) {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversation.id)
        .eq("user_id", user.id);
    }
  };

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, content, encrypted_content, iv, image_url, created_at")
      .eq("conversation_id", conversation.id)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const older = (data || []).map(decodeRow).reverse();
    if (older.length < PAGE_SIZE) setHasMore(false);
    setMessages((prev) => [...older, ...prev]);
    setLoadingOlder(false);
    // Preserve scroll position after prepending
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight;
    });
  }, [conversation.id, hasMore, loadingOlder, messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) loadOlder();
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAtBottom(nearBottom);
  };

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchPeerRead = async () => {
    const { data } = await supabase
      .from("conversation_participants")
      .select("last_read_at")
      .eq("conversation_id", conversation.id)
      .eq("user_id", conversation.participant.id)
      .maybeSingle();
    if (data?.last_read_at) setPeerLastRead(data.last_read_at);
  };

  useEffect(() => {
    if (!user) return;
    initialLoadRef.current = true;
    setHasMore(true);
    setMessages([]);
    fetchInitial();
    fetchPeerRead();

    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const decoded = decodeRow(payload.new);
          setMessages((prev) => (prev.some((m) => m.id === decoded.id) ? prev : [...prev, decoded]));
          if (decoded.sender_id !== user.id) {
            supabase.from("conversation_participants")
              .update({ last_read_at: new Date().toISOString() })
              .eq("conversation_id", conversation.id).eq("user_id", user.id);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const id = (payload.old as any)?.id;
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as any;
          if (row.user_id === conversation.participant.id && row.last_read_at) {
            setPeerLastRead(row.last_read_at);
          }
        },
      )
      .subscribe();

    const callChannel = supabase
      .channel(`call-signal-${conversation.id}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "webrtc_signals", filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          const signal = payload.new as any;
          if (signal.signal_type === "offer" && signal.conversation_id === conversation.id) setIncomingCall(true);
        },
      )
      .subscribe();

    const typing = supabase.channel(`typing-${conversation.id}`, { config: { broadcast: { self: false } } });
    typing.on("broadcast", { event: "typing" }, (payload) => {
      const from = (payload as any).payload?.user_id;
      if (from && from !== user.id) {
        setPeerTyping(true);
        clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
      }
    });
    typing.subscribe();
    typingChannelRef.current = typing;

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(callChannel);
      supabase.removeChannel(typing);
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(peerTypingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, user, conversation.participant.id]);

  useEffect(() => {
    // Only auto-scroll to bottom on initial load and new incoming messages, not when prepending history
    if (initialLoadRef.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      initialLoadRef.current = false;
      return;
    }
    // For subsequent updates, scroll only if already near bottom
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerTyping]);

  const emitTyping = () => {
    if (!user || !typingChannelRef.current) return;
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: user.id } });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!typingTimeoutRef.current) {
      emitTyping();
      typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 1500);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return;
    const text = input;
    setInput("");
    setSending(true);
    // Optimistic add so the message appears in the chat instantly
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      sender_id: user.id,
      text,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { data, error } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        content: text,
      }).select().single();
      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast.error(error.message);
        setInput(text);
        return;
      }
      // Replace temp with real row (dedupe if realtime already delivered)
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (data && !withoutTemp.some((m) => m.id === (data as any).id)) {
          return [...withoutTemp, decodeRow(data)];
        }
        return withoutTemp;
      });
      onMessageSent?.();
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    const err = validateImageFile(file);
    if (err) { toast.error(err); return; }
    setSending(true);
    setUploadProgress(5);
    let tick: any = null;
    try {
      const compressed = await compressImage(file, { maxDimension: 1600, quality: 0.82 });
      setUploadProgress(25);
      const ext = compressed.name.split(".").pop() || "jpg";
      const path = `${user.id}/${conversation.id}/${Date.now()}.${ext}`;
      let p = 25;
      tick = setInterval(() => { p = Math.min(90, p + 4); setUploadProgress(p); }, 200);
      const { error: upErr } = await supabase.storage.from("chat-images")
        .upload(path, compressed, { contentType: compressed.type, upsert: false });
      clearInterval(tick); tick = null;
      if (upErr) { toast.error("Upload failed: " + upErr.message); return; }
      setUploadProgress(95);
      const { data: signed } = await supabase.storage.from("chat-images").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? null;
      if (!url) { toast.error("Could not generate image URL"); return; }
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        image_url: url,
      });
      setUploadProgress(100);
      onMessageSent?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not send image");
    } finally {
      if (tick) clearInterval(tick);
      setSending(false);
      setTimeout(() => setUploadProgress(null), 600);
    }
  };

  const handleDownload = async (url: string, id: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `chat-${id}.jpg`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch { toast.error("Could not download"); }
  };

  const requestDeleteMessage = (id: string) => {
    setOpenMenuId(null);
    setPendingDeleteId(id);
  };

  const confirmDeleteMessage = () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    const snapshot = messages.find((m) => m.id === id);
    if (!snapshot) return;
    // optimistic hide
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const timer = setTimeout(async () => {
      pendingTimersRef.current.delete(id);
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) { toast.error(error.message); fetchInitial(); }
      else onMessageSent?.();
    }, 5000);
    pendingTimersRef.current.set(id, timer);
    toast("Message deleted", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          const t = pendingTimersRef.current.get(id);
          if (t) { clearTimeout(t); pendingTimersRef.current.delete(id); }
          setMessages((prev) => [...prev, snapshot].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          ));
        },
      },
    });
  };

  const acceptCall = () => { setIncomingCall(false); setShowVideoCall(true); };

  const lastSeenId = useMemo(() => {
    if (!peerLastRead || !user) return null;
    const mine = messages.filter((m) => m.sender_id === user.id);
    let last: string | null = null;
    for (const m of mine) {
      if (new Date(m.created_at).getTime() <= new Date(peerLastRead).getTime()) last = m.id;
    }
    return last;
  }, [messages, peerLastRead, user]);

  return (
    <div className="flex flex-col h-full relative min-h-0" onClick={() => setOpenMenuId(null)}>
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
        {onBack && (
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors lg:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <button onClick={() => openProfile(conversation.participant.id)} className="relative shrink-0">
          <img src={conversation.participant.avatar_url || ""} alt={conversation.participant.display_name} className="w-9 h-9 rounded-full object-cover hover:ring-2 hover:ring-primary/30 transition-all" />
          {conversation.participant.is_online && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
          )}
        </button>
        <button onClick={() => openProfile(conversation.participant.id)} className="flex-1 text-left min-w-0">
          <p className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate">{conversation.participant.display_name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            {peerTyping ? (
              <span className="text-primary font-medium">typing…</span>
            ) : (
              <><Lock className="w-3 h-3" /> Secured in transit & at rest</>
            )}
          </p>
        </button>
        <button onClick={() => { setCallAudioOnly(true); setShowVideoCall(true); }} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all" title="Audio call">
          <Phone className="w-5 h-5" />
        </button>
        <button onClick={() => { setCallAudioOnly(false); setShowVideoCall(true); }} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all" title="Video call">
          <Video className="w-5 h-5" />
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-thin p-3 sm:p-4 space-y-3 overscroll-contain">
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="text-center text-[10px] text-muted-foreground/60 py-1">Start of conversation</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          const showSeen = isMe && msg.id === lastSeenId;
          const menuOpen = openMenuId === msg.id;
          return (
            <div key={msg.id} className={cn("flex flex-col group", isMe ? "items-end" : "items-start")}>
              <div className={cn("flex items-center gap-1 max-w-[85%] sm:max-w-[75%]", isMe ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "rounded-2xl text-sm overflow-hidden relative",
                  isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-secondary-foreground rounded-bl-md",
                )}>
                  {msg.image_url && (
                    <div className="relative group/img">
                      <img src={msg.image_url} alt="Sent" className="max-w-full max-h-80 object-cover block" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(msg.image_url!, msg.id); }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-100 sm:opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/80"
                        aria-label="Download image"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {msg.text && (
                    <div className="px-4 py-2.5">
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  )}
                  <p className={cn(
                    "text-[10px] px-4 pb-1.5 flex items-center gap-1 justify-end",
                    isMe ? "text-primary-foreground/60" : "text-muted-foreground",
                    !msg.text && "pt-1.5",
                  )}>
                    <span>{formatTime(msg.created_at)}</span>
                    {isMe && (showSeen ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                  </p>
                </div>
                {isMe && !msg.is_legacy_encrypted && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : msg.id); }}
                      className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label="Message options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); requestDeleteMessage(msg.id); }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {showSeen && (<span className="text-[10px] text-muted-foreground mt-0.5 mr-1">Seen</span>)}
            </div>
          );
        })}
        {peerTyping && (
          <div className="flex items-center gap-2 pl-2">
            <div className="bg-secondary rounded-2xl rounded-bl-md px-3 py-2 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          onClick={jumpToLatest}
          aria-label="Jump to latest messages"
          className="absolute right-4 bottom-24 sm:bottom-28 z-20 bg-primary text-primary-foreground rounded-full p-2.5 shadow-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <ArrowDown className="w-4 h-4" />
          <span className="text-xs font-semibold pr-1">Latest</span>
        </button>
      )}


      <div className="p-3 sm:p-4 border-t border-border bg-card/80 backdrop-blur-sm pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {uploadProgress !== null && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Uploading image…</span><span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}
        <div className="flex gap-2">
          <input type="file" ref={fileRef} hidden accept="image/*" onChange={handleImageSelect} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Attach image"
            className="p-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50 shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 min-w-0 bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="bg-primary text-primary-foreground p-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {incomingCall && (
        <div className="absolute top-16 left-0 right-0 mx-4 bg-primary/20 border border-primary/30 rounded-xl p-4 flex items-center justify-between backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm font-semibold text-foreground">{conversation.participant.display_name} is calling...</span>
          </div>
          <div className="flex gap-2">
            <button onClick={acceptCall} className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg font-semibold hover:opacity-90">Accept</button>
            <button onClick={() => setIncomingCall(false)} className="px-4 py-1.5 bg-destructive text-destructive-foreground text-sm rounded-lg font-semibold hover:opacity-90">Decline</button>
          </div>
        </div>
      )}

      {showVideoCall && (
        <VideoCallModal
          conversationId={conversation.id}
          participantId={conversation.participant.id}
          participantName={conversation.participant.display_name}
          isIncoming={incomingCall}
          audioOnly={callAudioOnly}
          onClose={() => setShowVideoCall(false)}
        />
      )}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll have 5 seconds to undo. After that it will be removed for everyone in this chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMessage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatWindow;
