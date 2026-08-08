import { useState, useEffect } from "react";
import PostCard from "./PostCard";
import CreatePost from "./CreatePost";
import StoriesBar from "../stories/StoriesBar";
import ImmersivePostView from "./ImmersivePostView";
import AdSlot from "./AdSlot";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { moderateImage, containsSlang, computeAge } from "@/lib/contentModeration";

export interface PostWithAuthor {
  id: string;
  content: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  author_id: string;
  visibility?: "public" | "followers" | "private";
  author: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    verified_until?: string | null;
  };
  isLiked: boolean;
}

const shufflePosts = (arr: PostWithAuthor[]): PostWithAuthor[] => {
  return [...arr]
    .map((p) => {
      const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 36e5;
      const freshness = 1 / (1 + ageHours / 12);
      return { p, score: Math.random() * 0.7 + freshness * 0.3 };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
};

const Feed = () => {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [immersiveIndex, setImmersiveIndex] = useState<number | null>(null);
  const { user, profile } = useAuth();

  const fetchPosts = async () => {
    const { data: postsData } = await supabase
      .from("posts")
      .select("*, profiles!posts_author_id_fkey(id, display_name, username, avatar_url, verified_until)")
      .order("created_at", { ascending: false })
      .limit(80);

    if (!postsData) { setLoading(false); return; }

    let likedPostIds = new Set<string>();
    if (user) {
      const { data: likes } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id);
      likedPostIds = new Set(likes?.map((l) => l.post_id) || []);
    }

    const mapped: PostWithAuthor[] = postsData.map((p: any) => ({
      id: p.id,
      content: p.content,
      image_url: p.image_url,
      likes_count: p.likes_count || 0,
      comments_count: p.comments_count || 0,
      shares_count: p.shares_count || 0,
      created_at: p.created_at,
      author_id: p.author_id,
      visibility: p.visibility ?? "public",
      author: p.profiles,
      isLiked: likedPostIds.has(p.id),
    }));

    setPosts(shufflePosts(mapped));
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, [user]);

  const handleNewPost = async (
    content: string,
    imageFile?: File,
    onProgress?: (pct: number, label?: string) => void,
  ) => {
    if (!user) return;
    if (containsSlang(content)) {
      toast.error("Your post contains language that isn't allowed.");
      return;
    }
    let imageUrl: string | null = null;

    if (imageFile) {
      onProgress?.(10, "Checking image…");
      const age = computeAge(profile?.date_of_birth as any);
      const verdict = await moderateImage(imageFile, { userAge: age });
      if (!verdict.allowed) {
        toast.error(verdict.reason || "This image was blocked by content moderation.");
        return;
      }
      onProgress?.(35, "Uploading image…");
      const ext = imageFile.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
      if (uploadError) {
        toast.error("Image upload failed: " + uploadError.message);
        return;
      }
      onProgress?.(85, "Finalizing…");
      const { data: signed } = await supabase.storage
        .from("post-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      imageUrl = signed?.signedUrl ?? null;
    }

    onProgress?.(95, "Publishing…");
    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      content,
      image_url: imageUrl,
    });

    if (error) toast.error("Failed to create post");
    else { onProgress?.(100, "Done"); toast.success("Post created!"); fetchPosts(); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const showAds = profile?.ads_enabled !== false;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Feed</h1>

      <StoriesBar />
      <CreatePost onPost={handleNewPost} />
      {posts.map((post, i) => (
        <div key={post.id} className="space-y-4">
          <PostCard
            post={post}
            onLikeChange={fetchPosts}
            onOpenImmersive={() => setImmersiveIndex(i)}
            onPostChanged={fetchPosts}
          />
          {showAds && i > 0 && (i + 1) % 6 === 0 && (
            <AdSlot slot="5529718331" />
          )}
        </div>
      ))}
      {posts.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <p className="text-muted-foreground text-sm">No posts yet. Be the first to share!</p>
        </div>
      )}
      {immersiveIndex !== null && (
        <ImmersivePostView
          posts={posts}
          index={immersiveIndex}
          onClose={() => setImmersiveIndex(null)}
          onIndexChange={setImmersiveIndex}
          onLikeChange={fetchPosts}
        />
      )}
    </div>
  );
};

export default Feed;
