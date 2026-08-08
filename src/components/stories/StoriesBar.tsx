import { useState, useEffect, useRef } from "react";
import { Plus, X, Heart, Send, Pause, MessageCircle, Trash2, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Story {
  id: string;
  user_id: string;
  image_url: string;
  caption: string;
  created_at: string;
  expires_at: string;
}

interface StoryGroup {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  stories: Story[];
}

interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  emoji: string;
}

interface StoryComment {
  id: string;
  story_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: { display_name: string; avatar_url: string; username: string };
}

const GRADIENTS = [
  "from-fuchsia-500 via-pink-500 to-orange-400",
  "from-cyan-400 via-blue-500 to-indigo-600",
  "from-emerald-400 via-teal-500 to-cyan-600",
  "from-amber-400 via-orange-500 to-rose-500",
  "from-violet-500 via-purple-500 to-pink-500",
];

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];

const StoriesBar = () => {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [viewingGroup, setViewingGroup] = useState<StoryGroup | null>(null);
  const [viewingIndex, setViewingIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [reply, setReply] = useState("");
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<Array<{ id: string; viewed_at: string; profile?: { display_name: string; username: string; avatar_url: string } | null }>>([]);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; preview: string } | null>(null);
  const [pendingCaption, setPendingCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);
  const { user, profile } = useAuth();

  const fetchStories = async () => {
    const { data: rawData } = await supabase
      .from("stories" as any)
      .select("*")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    const data = (rawData || []) as unknown as Story[];
    if (!data.length) {
      setStoryGroups([]);
      return;
    }

    const userIds = [...new Set(data.map((s) => s.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    const groups: StoryGroup[] = userIds.map((uid) => {
      const p = profileMap.get(uid);
      return {
        userId: uid,
        displayName: p?.display_name || "User",
        username: p?.username || "",
        avatarUrl: p?.avatar_url || "",
        stories: data.filter((s) => s.user_id === uid),
      };
    });

    groups.sort((a, b) => (a.userId === user?.id ? -1 : b.userId === user?.id ? 1 : 0));
    setStoryGroups(groups);
  };

  useEffect(() => {
    fetchStories();
  }, [user]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !user) return;
    const { validateImageFile } = await import("@/lib/uploadValidation");
    const verr = validateImageFile(file);
    if (verr) {
      toast.error(verr);
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendingUpload({ file, preview });
    setPendingCaption("");
  };

  const cancelPendingUpload = () => {
    if (pendingUpload) URL.revokeObjectURL(pendingUpload.preview);
    setPendingUpload(null);
    setPendingCaption("");
  };

  const publishStory = async () => {
    if (!pendingUpload || !user) return;
    setUploading(true);
    try {
      const { file } = pendingUpload;
      const { moderateImage, containsSlang, computeAge } = await import("@/lib/contentModeration");
      if (containsSlang(pendingCaption)) {
        toast.error("Your caption contains language that isn't allowed.");
        return;
      }
      const age = computeAge((profile as any)?.date_of_birth);
      const verdict = await moderateImage(file, { userAge: age });
      if (!verdict.allowed) {
        toast.error(verdict.reason || "This image was blocked by content moderation.");
        return;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("stories")
        .upload(path, file, { contentType: file.type });
      if (error) {
        toast.error("Upload failed: " + error.message);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("stories")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const { error: insErr } = await supabase.from("stories").insert({
        user_id: user.id,
        image_url: signed?.signedUrl ?? "",
        image_path: path,
        caption: pendingCaption.trim(),
      } as any);
      if (insErr) {
        toast.error("Could not save story: " + insErr.message);
        return;
      }
      toast.success("Story published!");
      cancelPendingUpload();
      fetchStories();
    } finally {
      setUploading(false);
    }
  };


  const openStory = (group: StoryGroup) => {
    setViewingGroup(group);
    setViewingIndex(0);
    setProgress(0);
    setPaused(false);
    setReply("");
  };

  useEffect(() => {
    if (!viewingGroup || paused) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          if (viewingIndex < viewingGroup.stories.length - 1) {
            setViewingIndex((i) => i + 1);
          } else {
            setViewingGroup(null);
          }
          return 0;
        }
        return prev + 1.5;
      });
    }, 80);
    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [viewingGroup, viewingIndex, paused]);

  // Load reactions & comments for current story
  const currentStory = viewingGroup?.stories[viewingIndex];
  useEffect(() => {
    if (!currentStory) { setReactions([]); setComments([]); return; }
    const load = async () => {
      const [{ data: rx }, { data: cm }] = await Promise.all([
        supabase.from("story_reactions" as any).select("*").eq("story_id", currentStory.id),
        supabase.from("story_comments" as any).select("*").eq("story_id", currentStory.id).order("created_at", { ascending: false }).limit(100),
      ]);
      setReactions((rx || []) as unknown as StoryReaction[]);
      const cms = (cm || []) as unknown as StoryComment[];
      if (cms.length) {
        const uids = [...new Set(cms.map((c) => c.user_id))];
        const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", uids);
        const map = new Map((profs || []).map((p) => [p.id, p]));
        setComments(cms.map((c) => ({ ...c, author: map.get(c.user_id) as any })));
      } else {
        setComments([]);
      }
      // Record a story view (upsert-style: unique constraint prevents duplicates)
      if (user && currentStory.user_id !== user.id) {
        await supabase.from("story_views" as any).insert({
          story_id: currentStory.id, viewer_id: user.id,
        }).select().maybeSingle();
      }
    };
    load();
  }, [currentStory?.id, user]);

  const loadViewers = async () => {
    if (!currentStory || currentStory.user_id !== user?.id) return;
    const { data } = await supabase
      .from("story_views" as any)
      .select("id, viewed_at, viewer_id")
      .eq("story_id", currentStory.id)
      .order("viewed_at", { ascending: false });
    const rows = (data as any[]) || [];
    if (rows.length) {
      const uids = [...new Set(rows.map((r) => r.viewer_id))];
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", uids);
      const map = new Map((profs || []).map((p) => [p.id, p]));
      setViewers(rows.map((r) => ({ id: r.id, viewed_at: r.viewed_at, profile: map.get(r.viewer_id) as any })));
    } else {
      setViewers([]);
    }
  };

  const toggleReaction = async (emoji: string) => {
    if (!currentStory || !user) return;
    const mine = reactions.find((r) => r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id));
      await supabase.from("story_reactions" as any).delete().eq("id", mine.id);
    } else {
      const optimistic: StoryReaction = {
        id: `tmp-${Date.now()}`,
        story_id: currentStory.id,
        user_id: user.id,
        emoji,
      };
      setReactions((prev) => [...prev, optimistic]);
      const { data, error } = await supabase.from("story_reactions" as any)
        .insert({ story_id: currentStory.id, user_id: user.id, emoji })
        .select().maybeSingle();
      if (error) {
        setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
        if (!error.message.toLowerCase().includes("duplicate")) toast.error(error.message);
      } else if (data) {
        setReactions((prev) => prev.map((r) => (r.id === optimistic.id ? (data as any) : r)));
      }
    }
  };

  const submitComment = async () => {
    if (!reply.trim() || !currentStory || !user) return;
    setSubmittingComment(true);
    const content = reply.trim().slice(0, 500);
    const { data, error } = await supabase.from("story_comments" as any)
      .insert({ story_id: currentStory.id, user_id: user.id, content })
      .select().maybeSingle();
    setSubmittingComment(false);
    if (error) { toast.error(error.message); return; }
    setReply("");
    if (data) {
      const author = {
        display_name: profile?.display_name || "You",
        username: profile?.username || "",
        avatar_url: profile?.avatar_url || "",
      };
      setComments((prev) => [{ ...(data as any), author }, ...prev]);
    }
    toast.success("Comment sent");
  };

  const deleteComment = async (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("story_comments" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const burstHeart = (x: number, y: number) => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, { id, x, y }]);
    setTimeout(() => setHearts((h) => h.filter((it) => it.id !== id)), 1200);
  };

  const handleImageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      burstHeart(e.clientX - rect.left, e.clientY - rect.top);
      toggleReaction("❤️");
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const myStoryGroup = storyGroups.find((g) => g.userId === user?.id);

  // Aggregate reactions per emoji
  const reactionCounts = QUICK_EMOJIS.map((e) => ({
    emoji: e,
    count: reactions.filter((r) => r.emoji === e).length,
    mine: !!reactions.find((r) => r.emoji === e && r.user_id === user?.id),
  }));
  const totalReactions = reactions.length;

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-1">
          <div className="flex flex-col items-center gap-1 shrink-0 relative">
            <button
              onClick={() => (myStoryGroup ? openStory(myStoryGroup) : fileRef.current?.click())}
              className="w-16 h-16 rounded-full bg-secondary border-2 border-dashed border-primary/40 flex items-center justify-center hover:border-primary transition-colors overflow-hidden"
            >
              {myStoryGroup ? (
                <img
                  src={profile?.avatar_url || ""}
                  alt="Your story"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <Plus className="w-6 h-6 text-primary" />
              )}
            </button>
            {myStoryGroup && (
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute top-10 right-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-card hover:scale-110 transition-transform"
                aria-label="Add to your story"
              >
                <Plus className="w-3 h-3 text-primary-foreground" />
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">Your story</span>
          </div>
          <input type="file" ref={fileRef} hidden accept="image/*" onChange={handleFilePick} />

          {storyGroups
            .filter((g) => g.userId !== user?.id)
            .map((group, idx) => (
              <button
                key={group.userId}
                onClick={() => openStory(group)}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  className={`w-16 h-16 rounded-full p-0.5 bg-gradient-to-br ${GRADIENTS[idx % GRADIENTS.length]} animate-[spin_8s_linear_infinite]`}
                  style={{ animationPlayState: "paused" }}
                >
                  <img
                    src={group.avatarUrl}
                    alt={group.displayName}
                    className="w-full h-full rounded-full object-cover border-2 border-card"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground truncate max-w-[64px]">
                  {group.displayName}
                </span>
              </button>
            ))}
        </div>
      </div>

      {/* Caption composer dialog */}
      <Dialog open={!!pendingUpload} onOpenChange={(o) => !o && !uploading && cancelPendingUpload()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share your story</DialogTitle>
            <DialogDescription>
              Preview your image and add a caption. Stories vanish after 24 hours.
            </DialogDescription>
          </DialogHeader>
          {pendingUpload && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black">
                <img
                  src={pendingUpload.preview}
                  alt="Story preview"
                  className="w-full max-h-[50vh] object-contain"
                />
                {pendingCaption && (
                  <div className="absolute bottom-3 left-3 right-3 text-center pointer-events-none">
                    <p className="text-sm text-white bg-black/50 px-4 py-2 rounded-2xl backdrop-blur-md inline-block max-w-full break-words">
                      {pendingCaption}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <textarea
                  value={pendingCaption}
                  onChange={(e) => setPendingCaption(e.target.value.slice(0, 200))}
                  placeholder="Write a caption... (optional)"
                  rows={2}
                  className="w-full bg-secondary text-foreground text-sm px-4 py-2 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-1">
                  {pendingCaption.length}/200
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={cancelPendingUpload} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={publishStory} disabled={uploading}>
              {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing…</> : "Share story"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingGroup && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <button
            onClick={() => setViewingGroup(null)}
            className="absolute top-4 right-4 text-foreground/70 hover:text-foreground z-20"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          <div
            className="relative w-full max-w-md h-[85vh] rounded-3xl overflow-hidden bg-card shadow-2xl ring-1 ring-primary/20"
            onMouseDown={() => setPaused(true)}
            onMouseUp={() => setPaused(false)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
          >
            <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
              {viewingGroup.stories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 bg-foreground/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full transition-all duration-75"
                    style={{
                      width: i < viewingIndex ? "100%" : i === viewingIndex ? `${progress}%` : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="absolute top-5 left-3 right-12 flex items-center gap-2 z-10">
              <img
                src={viewingGroup.avatarUrl}
                alt={viewingGroup.displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/50"
              />
              <span className="text-sm font-semibold text-foreground drop-shadow-lg">
                {viewingGroup.displayName}
              </span>
              {paused && <Pause className="w-4 h-4 text-foreground/70 ml-1" />}
            </div>

            <div className="relative w-full h-full" onClick={handleImageTap}>
              <img
                src={currentStory?.image_url}
                alt="Story"
                className="w-full h-full object-cover select-none"
                draggable={false}
              />
              {hearts.map((h) => (
                <Heart
                  key={h.id}
                  className="absolute w-16 h-16 text-rose-500 fill-rose-500 pointer-events-none animate-[ping_1s_ease-out]"
                  style={{ left: h.x - 32, top: h.y - 32 }}
                />
              ))}
            </div>

            {currentStory?.caption && (
              <div className="absolute bottom-32 left-4 right-4 text-center pointer-events-none">
                <p className="text-sm text-foreground bg-background/50 px-4 py-2 rounded-2xl backdrop-blur-md inline-block max-w-full break-words">
                  {currentStory.caption}
                </p>
              </div>
            )}

            {/* Reactions bar */}
            <div className="absolute bottom-14 left-3 right-3 z-10 flex justify-center gap-1.5 pointer-events-auto">
              {reactionCounts.map((r) => (
                <button
                  key={r.emoji}
                  onClick={(e) => { e.stopPropagation(); toggleReaction(r.emoji); }}
                  className={`px-2.5 py-1 rounded-full backdrop-blur-md text-sm transition-all border ${
                    r.mine ? "bg-primary/30 border-primary scale-110" : "bg-background/40 border-foreground/10 hover:bg-background/60"
                  }`}
                  aria-label={`React with ${r.emoji}`}
                >
                  <span>{r.emoji}</span>
                  {r.count > 0 && <span className="text-[10px] ml-1 text-foreground/80">{r.count}</span>}
                </button>
              ))}
            </div>

            {/* Bottom action row */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 z-10">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); submitComment(); } }}
                placeholder={viewingGroup.userId === user?.id ? "Add a comment…" : `Comment to ${viewingGroup.displayName}…`}
                className="flex-1 bg-background/40 backdrop-blur-md text-foreground placeholder:text-foreground/60 text-sm rounded-full px-4 py-2 border border-foreground/20 outline-none focus:border-primary"
              />
              <button
                onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); setPaused(true); }}
                className="relative w-9 h-9 rounded-full bg-background/40 backdrop-blur-md flex items-center justify-center hover:bg-background/60 transition-colors"
                aria-label="View comments"
              >
                <MessageCircle className="w-4 h-4 text-foreground" />
                {comments.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {comments.length > 9 ? "9+" : comments.length}
                  </span>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); submitComment(); }}
                disabled={submittingComment || !reply.trim()}
                className="w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
                aria-label="Send comment"
              >
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>

            {viewingGroup.userId === user?.id && (
              <button
                onClick={(e) => { e.stopPropagation(); setViewersOpen(true); setPaused(true); loadViewers(); }}
                className="absolute top-16 left-3 text-[11px] text-foreground/80 bg-background/50 backdrop-blur-md rounded-full px-2.5 py-1 flex items-center gap-1 hover:bg-background/70 z-10"
              >
                <Eye className="w-3 h-3" /> Viewers
                {totalReactions > 0 && <span className="ml-1 opacity-70">· {totalReactions} reaction{totalReactions === 1 ? "" : "s"}</span>}
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (viewingIndex > 0) setViewingIndex((i) => i - 1);
              }}
              className="absolute left-0 top-12 bottom-32 w-1/3"
              aria-label="Previous"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (viewingIndex < viewingGroup.stories.length - 1) {
                  setViewingIndex((i) => i + 1);
                } else {
                  setViewingGroup(null);
                }
              }}
              className="absolute right-0 top-12 bottom-32 w-1/3"
              aria-label="Next"
            />
          </div>

          {/* Comments sheet */}
          <Sheet open={commentsOpen} onOpenChange={(o) => { setCommentsOpen(o); if (!o) setPaused(false); }}>
            <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Comments · {comments.length}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 pb-6">
                {comments.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No comments yet. Be the first!</p>
                )}
                {comments.map((c) => {
                  const canDelete = c.user_id === user?.id || currentStory?.user_id === user?.id;
                  return (
                    <div key={c.id} className="flex gap-2 items-start group">
                      <img
                        src={c.author?.avatar_url || ""}
                        alt={c.author?.display_name || "User"}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0 bg-secondary rounded-2xl px-3 py-2">
                        <p className="text-xs font-semibold text-foreground">
                          {c.author?.display_name || "User"}
                        </p>
                        <p className="text-sm text-foreground/90 break-words">{c.content}</p>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          aria-label="Delete comment"
                          className="p-1.5 text-muted-foreground hover:text-destructive opacity-60 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* Viewers sheet (story owner) */}
          <Sheet open={viewersOpen} onOpenChange={(o) => { setViewersOpen(o); if (!o) setPaused(false); }}>
            <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader><SheetTitle>Viewers · {viewers.length}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2 pb-6">
                {viewers.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No one has seen this story yet.</p>
                )}
                {viewers.map((v) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <img src={v.profile?.avatar_url || ""} alt={v.profile?.display_name || "Viewer"} className="w-9 h-9 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{v.profile?.display_name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">@{v.profile?.username}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{new Date(v.viewed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </>
  );
};

export default StoriesBar;
