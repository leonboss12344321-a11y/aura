import { useEffect, useState } from "react";
import { Send, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: { id: string; display_name: string; username: string; avatar_url: string | null };
}

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

interface Props {
  postId: string;
  onCountChange?: (delta: number) => void;
}

const CommentsSection = ({ postId, onCountChange }: Props) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const { openProfile } = useNav();

  const fetchComments = async () => {
    const { data } = await supabase
      .from("comments" as any)
      .select("*, profiles!comments_author_id_fkey(id, display_name, username, avatar_url)" as any)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    const mapped = ((data || []) as any[]).map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      author_id: c.author_id,
      author: c.profiles,
    }));
    setComments(mapped);
    setLoading(false);
  };

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
        () => fetchComments()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    const { error } = await supabase.from("comments" as any).insert({
      post_id: postId,
      author_id: user.id,
      content: text,
    } as any);
    setSending(false);
    if (error) {
      toast.error("Failed to post comment");
      setInput(text);
    } else {
      onCountChange?.(1);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("comments" as any).delete().eq("id", id);
    if (error) toast.error("Could not delete");
    else onCountChange?.(-1);
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Be the first to comment</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 items-start group">
              <button onClick={() => openProfile(c.author_id)} className="shrink-0">
                <img
                  src={c.author?.avatar_url || ""}
                  alt={c.author?.display_name}
                  className="w-7 h-7 rounded-full object-cover hover:ring-2 hover:ring-primary/30 transition-all"
                />
              </button>
              <div className="flex-1 bg-secondary/50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <button
                    onClick={() => openProfile(c.author_id)}
                    className="text-xs font-semibold text-foreground hover:text-primary"
                  >
                    {c.author?.display_name}
                  </button>
                  <span className="text-[10px] text-muted-foreground">{formatTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-foreground/90 break-words">{c.content}</p>
              </div>
              {user?.id === c.author_id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Write a comment..."
          className="flex-1 bg-secondary text-foreground text-sm px-3 py-2 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="bg-primary text-primary-foreground p-2 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CommentsSection;
