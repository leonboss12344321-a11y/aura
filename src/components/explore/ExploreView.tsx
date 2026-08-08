import { Search, TrendingUp, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { toast } from "sonner";

const trending = [
  { tag: "#DarkMode", posts: "12.4K" },
  { tag: "#WebDev", posts: "8.7K" },
  { tag: "#Minimalism", posts: "6.2K" },
  { tag: "#IndieGames", posts: "4.9K" },
  { tag: "#DigitalNomad", posts: "3.1K" },
];

interface ProfileLite {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
}

const ExploreView = () => {
  const [suggestions, setSuggestions] = useState<ProfileLite[]>([]);
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const { openProfile } = useNav();
  const debounceRef = useRef<number | null>(null);

  // Initial: suggestions + my following set
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, bio")
        .neq("id", user?.id || "")
        .limit(10);
      setSuggestions(data || []);
      if (user) {
        const { data: following } = await supabase.from("followers").select("following_id").eq("follower_id", user.id);
        setFollowedIds(new Set(following?.map((f) => f.following_id) || []));
      }
    })();
  }, [user]);

  // Debounced server-side search (auto-complete)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const cleaned = q.replace(/[%_]/g, "").replace(/^@/, "");
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, bio")
        .neq("id", user?.id || "")
        .or(`username.ilike.%${cleaned}%,display_name.ilike.%${cleaned}%`)
        .limit(15);
      setResults(data || []);
      setSearching(false);
    }, 220);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search, user]);

  const toggleFollow = async (id: string) => {
    if (!user) return;
    if (followedIds.has(id)) {
      await supabase.from("followers").delete().eq("follower_id", user.id).eq("following_id", id);
      setFollowedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Unfollowed");
    } else {
      await supabase.from("followers").insert({ follower_id: user.id, following_id: id });
      setFollowedIds((prev) => new Set(prev).add(id));
      toast.success("Following!");
    }
  };

  const renderUser = (u: ProfileLite) => (
    <div key={u.id} className="flex items-center gap-3">
      <button onClick={() => openProfile(u.id)} className="shrink-0">
        <img src={u.avatar_url || ""} alt={u.display_name} className="w-10 h-10 rounded-full object-cover hover:ring-2 hover:ring-primary/30 transition-all" />
      </button>
      <button onClick={() => openProfile(u.id)} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-foreground truncate hover:text-primary transition-colors">{u.display_name}</p>
        <p className="text-xs text-muted-foreground truncate">@{u.username}{u.bio ? ` · ${u.bio}` : ""}</p>
      </button>
      <button onClick={() => toggleFollow(u.id)}
        className={followedIds.has(u.id)
          ? "px-4 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-all"
          : "px-4 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"}>
        {followedIds.has(u.id) ? "Following" : "Follow"}
      </button>
    </div>
  );

  const query = search.trim();

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Explore</h1>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search people by name or @username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border text-foreground text-sm pl-11 pr-10 py-3 rounded-2xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all"
        />
        {searching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}

        {query && (
          <div className="absolute z-20 mt-2 w-full bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-border/60">
              {results.length === 0 && !searching && (
                <p className="p-4 text-sm text-muted-foreground text-center">No matches for "{query}"</p>
              )}
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { openProfile(u.id); setSearch(""); }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-secondary/60 transition-colors text-left"
                >
                  <img src={u.avatar_url || ""} alt={u.display_name} className="w-9 h-9 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!query && (
        <>
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">Trending</h2>
            </div>
            <div className="space-y-3">
              {trending.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1 cursor-pointer hover:bg-secondary/50 -mx-2 px-2 rounded-lg transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.tag}</p>
                    <p className="text-xs text-muted-foreground">{t.posts} posts</p>
                  </div>
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-foreground mb-4">Suggested for you</h2>
            <div className="space-y-3">
              {suggestions.map(renderUser)}
              {suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No other users yet. Invite friends!</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ExploreView;
