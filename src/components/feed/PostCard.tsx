import { useState } from "react";
import { Heart, MessageCircle, Share2, MoreHorizontal, Bookmark, Maximize2, Flag, Trash2, Globe, Users, Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { PostWithAuthor } from "./Feed";
import CommentsSection from "./CommentsSection";
import VerifiedBadge from "@/components/ui/verified-badge";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface PostCardProps {
  post: PostWithAuthor;
  onLikeChange?: () => void;
  onOpenImmersive?: () => void;
  onPostChanged?: () => void;
}

const REPORT_CATEGORIES = [
  { value: "spam", label: "Spam or scam", hint: "Repetitive, misleading, or fraudulent" },
  { value: "nudity", label: "Nudity or sexual content", hint: "Sexually explicit or suggestive imagery" },
  { value: "harassment", label: "Harassment or bullying", hint: "Targeted attacks on a person or group" },
  { value: "hate", label: "Hate speech", hint: "Attacks on identity or protected group" },
  { value: "violence", label: "Violence or dangerous content", hint: "Threats, gore, or dangerous acts" },
  { value: "self_harm", label: "Self-harm", hint: "Suicide or self-injury content" },
  { value: "misinformation", label: "False information", hint: "Verifiably false or misleading" },
  { value: "other", label: "Something else", hint: "Doesn't fit any of the above" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public", icon: Globe, hint: "Anyone on Socialite can see this" },
  { value: "followers", label: "Followers only", icon: Users, hint: "Only people who follow you" },
  { value: "private", label: "Only me", icon: Lock, hint: "Hidden from everyone else" },
] as const;

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const PostCard = ({ post, onLikeChange, onOpenImmersive, onPostChanged }: PostCardProps) => {
  const [liked, setLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [commentsCount, setCommentsCount] = useState(post.comments_count);
  const [showComments, setShowComments] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<string>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibility, setVisibility] = useState<string>(post.visibility || "public");
  const [savingVis, setSavingVis] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const { user, isOwner: viewerIsOwner } = useAuth();
  const { openProfile } = useNav();

  const isMine = user?.id === post.author_id;
  const authorIsOwner = false; // We can't know here without extra join; role check runs via viewer's own owner status only for badge

  const handleLike = async () => {
    if (!user) return;
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      setLiked(false); setLikesCount((c) => c - 1);
    } else {
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
      setLiked(true); setLikesCount((c) => c + 1);
    }
    onLikeChange?.();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
      // Increment shares_count in DB
      await supabase.rpc("increment_shares" as any, { post_id: post.id }).then(() => {});
      // Optimistic UI update via parent
      onLikeChange?.();
    } catch { toast.error("Could not copy link"); }
  };

  const submitReport = async () => {
    if (!user) { toast.error("Please sign in to report"); return; }
    if (!reportCategory) { toast.error("Pick a reason"); return; }
    setSubmittingReport(true);
    const { error } = await supabase.from("post_reports" as any).insert({
      post_id: post.id, reporter_id: user.id,
      category: reportCategory, details: reportDetails.trim() || null,
    });
    setSubmittingReport(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report submitted — moderators will review it.");
    setReportOpen(false); setReportDetails(""); setReportCategory("spam");
  };

  const confirmDelete = async () => {
    setDeleteOpen(false);
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Post deleted");
    onPostChanged?.();
  };

  const saveVisibility = async () => {
    setSavingVis(true);
    const { error } = await supabase.from("posts").update({ visibility } as any).eq("id", post.id);
    setSavingVis(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Privacy updated");
    setVisibilityOpen(false);
    onPostChanged?.();
  };

  const saveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed) { toast.error("Caption cannot be empty"); return; }
    if (trimmed === post.content) { setEditOpen(false); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("posts").update({ content: trimmed } as any).eq("id", post.id);
    setSavingEdit(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Caption updated");
    setEditOpen(false);
    onPostChanged?.();
  };

  const VisIcon = VISIBILITY_OPTIONS.find((v) => v.value === (post.visibility || "public"))?.icon || Globe;

  return (
    <article className="bg-card border border-border rounded-2xl p-5 hover:border-primary/20 transition-all duration-300 group">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => openProfile(post.author_id)} aria-label={`Open ${post.author?.display_name || "user"}'s profile`} className="shrink-0">
          <img src={post.author?.avatar_url || ""} alt={`${post.author?.display_name || "User"} profile photo`}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={() => openProfile(post.author_id)} className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate">
              {post.author?.display_name}
            </button>
            <VerifiedBadge verifiedUntil={post.author?.verified_until} />
            <button onClick={() => openProfile(post.author_id)} className="text-muted-foreground text-xs hover:text-primary transition-colors truncate">
              @{post.author?.username}
            </button>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {formatTime(post.created_at)}
            {post.visibility && post.visibility !== "public" && (
              <>· <VisIcon className="w-3 h-3" /> {post.visibility}</>
            )}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="More post options" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary">
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" /> Copy link
            </DropdownMenuItem>
            {isMine && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Your post</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => { setEditContent(post.content); setEditOpen(true); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit caption
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setVisibility(post.visibility || "public"); setVisibilityOpen(true); }}>
                  <Globe className="w-4 h-4 mr-2" /> Change privacy
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete post
                </DropdownMenuItem>
              </>
            )}
            {user && !isMine && (
              <DropdownMenuItem
                onClick={() => setReportOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Flag className="w-4 h-4 mr-2" /> Report post
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>

      {post.image_url && (
        <button
          onClick={onOpenImmersive}
          className="relative rounded-xl overflow-hidden mb-3 border border-border w-full block group/img"
          aria-label="Open image in immersive view"
        >
          <img
            src={post.image_url}
            alt={post.content ? `Image shared by ${post.author?.display_name || "user"}: ${post.content.slice(0, 80)}` : `Photo shared by ${post.author?.display_name || "user"}`}
            loading="lazy"
            className="w-full max-h-96 object-cover group-hover/img:scale-[1.02] transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-end justify-end p-3 pointer-events-none">
            <span className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 backdrop-blur text-white p-2 rounded-full">
              <Maximize2 className="w-4 h-4" />
            </span>
          </div>
        </button>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-1">
          <button onClick={handleLike} aria-pressed={liked}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              liked ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10")}>
            <Heart className={cn("w-4 h-4", liked && "fill-current")} aria-hidden="true" />
            {likesCount}
          </button>
          <button onClick={() => setShowComments((s) => !s)} aria-expanded={showComments}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              showComments ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}>
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            {commentsCount}
          </button>
          <button onClick={handleShare} aria-label="Share this post"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-all">
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {post.shares_count}
          </button>
        </div>
        <button onClick={() => setSaved(!saved)} aria-pressed={saved}
          className={cn("p-1.5 rounded-lg transition-all", saved ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500")}>
          <Bookmark className={cn("w-4 h-4", saved && "fill-current")} aria-hidden="true" />
        </button>
      </div>

      {showComments && (
        <CommentsSection postId={post.id} onCountChange={(d) => setCommentsCount((c) => Math.max(0, c + d))} />
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-destructive" /> Report post
            </DialogTitle>
            <DialogDescription>
              Reports are anonymous. Our moderators will review this post.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <RadioGroup value={reportCategory} onValueChange={setReportCategory} className="space-y-1">
              {REPORT_CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  htmlFor={`report-${post.id}-${c.value}`}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-secondary/50 transition-colors",
                    reportCategory === c.value && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem id={`report-${post.id}-${c.value}`} value={c.value} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <div>
              <Label htmlFor={`report-details-${post.id}`} className="text-xs">Additional context (optional)</Label>
              <Textarea
                id={`report-details-${post.id}`}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value.slice(0, 1000))}
                placeholder="Add anything moderators should know..."
                className="mt-1 text-sm"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">{reportDetails.length}/1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button
              onClick={submitReport}
              disabled={submittingReport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submittingReport ? "Submitting..." : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post privacy</DialogTitle>
            <DialogDescription>Control who can see this post.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={visibility} onValueChange={setVisibility} className="space-y-1">
            {VISIBILITY_OPTIONS.map((v) => (
              <label
                key={v.value}
                htmlFor={`vis-${post.id}-${v.value}`}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-secondary/50 transition-colors",
                  visibility === v.value && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem id={`vis-${post.id}-${v.value}`} value={v.value} className="mt-0.5" />
                <div className="min-w-0 flex items-start gap-2">
                  <v.icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{v.label}</p>
                    <p className="text-xs text-muted-foreground">{v.hint}</p>
                  </div>
                </div>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVisibilityOpen(false)}>Cancel</Button>
            <Button onClick={saveVisibility} disabled={savingVis}>{savingVis ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit caption</DialogTitle>
            <DialogDescription>Update the text of your post. The image stays the same.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value.slice(0, 2000))}
            rows={5}
            className="text-sm"
            placeholder="What's on your mind?"
          />
          <p className="text-[10px] text-muted-foreground text-right">{editContent.length}/2000</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the post, its likes, and comments. This cannot be undone.
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
    </article>
  );
};

export default PostCard;
