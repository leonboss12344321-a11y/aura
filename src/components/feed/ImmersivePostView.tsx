import { useEffect, useRef, useState } from "react";
import { X, Heart, MessageCircle, Share2, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PostWithAuthor } from "./Feed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import CommentsSection from "./CommentsSection";
import { toast } from "sonner";

interface Props {
  posts: PostWithAuthor[];
  index: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
  onLikeChange?: () => void;
}

const ImmersivePostView = ({ posts, index, onClose, onIndexChange, onLikeChange }: Props) => {
  const [current, setCurrent] = useState(index);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const { user } = useAuth();
  const { openProfile } = useNav();
  const touch = useRef<{ x: number; y: number; dist: number; baseZoom: number; basePan: {x:number;y:number}; mode: "none" | "swipe" | "pinch" } | null>(null);

  const post = posts[current];

  useEffect(() => { setCurrent(index); }, [index]);
  useEffect(() => {
    if (!post) return;
    setLiked(post.isLiked);
    setLikesCount(post.likes_count);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    onIndexChange?.(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, posts.length]);

  if (!post) return null;

  const goPrev = () => { if (current > 0) setCurrent(current - 1); };
  const goNext = () => { if (current < posts.length - 1) setCurrent(current + 1); };

  const handleLike = async () => {
    if (!user) return;
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      setLiked(false); setLikesCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
      setLiked(true); setLikesCount((c) => c + 1);
    }
    onLikeChange?.();
  };

  const handleDownload = async () => {
    if (!post.image_url) return;
    try {
      const res = await fetch(post.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `post-${post.id}.jpg`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Could not download image"); }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    catch { toast.error("Could not copy link"); }
  };

  // Touch: pinch-to-zoom + horizontal swipe between posts
  const distance = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touch.current = {
        x: 0, y: 0,
        dist: distance(e.touches[0], e.touches[1]),
        baseZoom: zoom,
        basePan: pan,
        mode: "pinch",
      };
    } else if (e.touches.length === 1) {
      touch.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        dist: 0,
        baseZoom: zoom,
        basePan: pan,
        mode: zoom > 1 ? "none" : "swipe",
      };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touch.current) return;
    if (e.touches.length === 2 && touch.current.mode === "pinch") {
      const d = distance(e.touches[0], e.touches[1]);
      const next = Math.max(1, Math.min(4, touch.current.baseZoom * (d / touch.current.dist)));
      setZoom(next);
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    if (touch.current.mode === "swipe" && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touch.current.x;
      const dy = e.changedTouches[0].clientY - touch.current.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext(); else goPrev();
      }
    }
    if (zoom <= 1) setPan({ x: 0, y: 0 });
    touch.current = null;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col lg:flex-row animate-in fade-in duration-200">
      <div className="relative flex-1 flex items-center justify-center overflow-hidden select-none"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 lg:right-auto lg:left-3 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {current > 0 && (
          <button onClick={goPrev} aria-label="Previous"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {current < posts.length - 1 && (
          <button onClick={goNext} aria-label="Next"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {post.image_url ? (
          <>
            <img
              src={post.image_url}
              alt={post.content || "Post image"}
              style={{ transform: `scale(${zoom}) translate(${pan.x}px,${pan.y}px)` }}
              className="max-w-full max-h-full object-contain transition-transform duration-200 touch-none"
              onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
              draggable={false}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-3 py-1.5 z-10">
              <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="text-white/80 hover:text-white" aria-label="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-white/80 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="text-white/80 hover:text-white" aria-label="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={handleDownload} className="text-white/80 hover:text-white ml-2" aria-label="Download image">
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 px-2 py-1 rounded-full">
              {current + 1} / {posts.length}
            </div>
          </>
        ) : (
          <div className="text-white/80 p-8 sm:p-12 text-center text-lg sm:text-xl max-w-2xl whitespace-pre-wrap">{post.content}</div>
        )}
      </div>

      <aside className="lg:w-[400px] shrink-0 bg-card border-l border-border flex flex-col max-h-[45vh] lg:max-h-full overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <button onClick={() => { openProfile(post.author_id); onClose(); }} className="shrink-0">
            <img src={post.author?.avatar_url || ""} alt={post.author?.display_name} className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/30" />
          </button>
          <button onClick={() => { openProfile(post.author_id); onClose(); }} className="flex-1 text-left min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{post.author?.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">@{post.author?.username}</p>
          </button>
        </div>
        {post.content && post.image_url && (
          <p className="px-4 py-3 text-sm text-foreground whitespace-pre-wrap border-b border-border">{post.content}</p>
        )}
        <div className="px-4 py-3 flex items-center gap-1 border-b border-border">
          <button onClick={handleLike} className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            liked ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
          )}>
            <Heart className={cn("w-4 h-4", liked && "fill-current")} /> {likesCount}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground">
            <MessageCircle className="w-4 h-4" /> {post.comments_count}
          </button>
          <button onClick={handleShare} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-all">
            <Share2 className="w-4 h-4" /> Share
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <CommentsSection postId={post.id} onCountChange={() => {}} />
        </div>
      </aside>
    </div>
  );
};

export default ImmersivePostView;
