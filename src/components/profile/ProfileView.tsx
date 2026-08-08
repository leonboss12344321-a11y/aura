import { useState, useEffect, useRef } from "react";
import PostCard from "../feed/PostCard";
import { PostWithAuthor } from "../feed/Feed";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { CalendarDays, Loader2, Camera, MessageCircle, ArrowLeft, Settings, LogOut, Image as ImageIcon, BadgeCheck, Cake } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import VerifiedBadge, { isVerified } from "@/components/ui/verified-badge";
import { toast } from "sonner";

type Profile = Tables<"profiles">;

const ProfileView = () => {
  const { user, profile: ownProfile, refreshProfile, signOut } = useAuth();
  const { viewedProfileId, setTab, openProfile, openConversation } = useNav();

  const isOwn = !viewedProfileId || viewedProfileId === user?.id;
  const targetId = isOwn ? user?.id : viewedProfileId;

  const [profile, setProfile] = useState<Profile | null>(isOwn ? ownProfile : null);
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [submittingUsername, setSubmittingUsername] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [myRequests, setMyRequests] = useState<Array<{ id: string; request_type: string; status: string; new_username: string | null; created_at: string }>>([]);
  const [verificationReason, setVerificationReason] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const { isOwner: viewerIsOwner, role } = useAuth();

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);

    const fetchData = async () => {
      const [profileRes, postsRes, followersRes, followingRes, isFollowingRes] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, banner_url, bio, verified_until, public_key, ads_enabled, adult_content, dob_visibility, is_online, accepted_terms_at, created_at, updated_at").eq("id", targetId).single(),
        supabase
          .from("posts")
          .select("*, profiles!posts_author_id_fkey(id, display_name, username, avatar_url)")
          .eq("author_id", targetId)
          .order("created_at", { ascending: false }),
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("following_id", targetId),
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("follower_id", targetId),
        user && !isOwn
          ? supabase.from("followers").select("id").eq("follower_id", user.id).eq("following_id", targetId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const p = profileRes.data;
      setProfile(p as any);
      setBio(p?.bio || "");
      setDisplayName(p?.display_name || "");

      const mapped: PostWithAuthor[] = (postsRes.data || []).map((post: any) => ({
        id: post.id, content: post.content, image_url: post.image_url,
        likes_count: post.likes_count || 0, comments_count: post.comments_count || 0,
        shares_count: post.shares_count || 0, created_at: post.created_at,
        author_id: post.author_id, author: post.profiles, isLiked: false,
      }));
      setPosts(mapped);
      setFollowerCount(followersRes.count || 0);
      setFollowingCount(followingRes.count || 0);
      setIsFollowing(!!isFollowingRes?.data);
      setLoading(false);
    };
    fetchData();
  }, [targetId, isOwn, user]);

  useEffect(() => {
    if (isOwn && ownProfile) {
      setProfile(ownProfile);
      setBio(ownProfile.bio || "");
      setDisplayName(ownProfile.display_name || "");
    }
  }, [ownProfile, isOwn]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const { validateImageFile } = await import("@/lib/uploadValidation");
    const verr = validateImageFile(file);
    if (verr) { toast.error(verr); return; }
    const { moderateImage, computeAge } = await import("@/lib/contentModeration");
    const verdict = await moderateImage(file, { userAge: computeAge((profile as any)?.date_of_birth) });
    if (!verdict.allowed) { toast.error(verdict.reason || "Image blocked by content moderation."); return; }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (!signed?.signedUrl) { toast.error("Could not get image URL"); return; }
    await supabase.from("profiles").update({ avatar_url: signed.signedUrl }).eq("id", user.id);
    await refreshProfile();
    toast.success("Avatar updated!");
  };
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const { validateImageFile } = await import("@/lib/uploadValidation");
    const verr = validateImageFile(file);
    if (verr) { toast.error(verr); return; }
    const { moderateImage, computeAge } = await import("@/lib/contentModeration");
    const verdict = await moderateImage(file, { userAge: computeAge((profile as any)?.date_of_birth) });
    if (!verdict.allowed) { toast.error(verdict.reason || "Image blocked by content moderation."); return; }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/banner-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("banners").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data: signed } = await supabase.storage.from("banners").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (!signed?.signedUrl) { toast.error("Could not get banner URL"); return; }
    await supabase.from("profiles").update({ banner_url: signed.signedUrl } as any).eq("id", user.id);
    await refreshProfile();
    toast.success("Banner updated!");
  };



  const handleSaveProfile = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ bio, display_name: displayName }).eq("id", user.id);
    await refreshProfile();
    setEditing(false);
    toast.success("Profile updated!");
  };

  const handleFollow = async () => {
    if (!user || !targetId || isOwn) return;
    if (isFollowing) {
      await supabase.from("followers").delete().eq("follower_id", user.id).eq("following_id", targetId);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("followers").insert({ follower_id: user.id, following_id: targetId });
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
    }
  };

  const handleMessage = async () => {
    if (!user || !targetId || isOwn) return;
    try {
      // Find a conversation we both belong to
      const { data: mine, error: mineErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);
      if (mineErr) throw mineErr;
      const myIds = (mine || []).map((c) => c.conversation_id);
      if (myIds.length) {
        const { data: shared, error: sharedErr } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .in("conversation_id", myIds)
          .eq("user_id", targetId)
          .limit(1);
        if (sharedErr) throw sharedErr;
        if (shared && shared.length) {
          openConversation(shared[0].conversation_id);
          return;
        }
      }
      // Create a new conversation
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({ created_by: user.id } as any)
        .select()
        .single();
      if (convErr || !conv) throw convErr || new Error("Insert returned no row");
      const { error: partErr } = await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: targetId },
      ]);
      if (partErr) throw partErr;
      openConversation(conv.id);
    } catch (err: any) {
      console.error("start conversation failed", err);
      toast.error("Could not start conversation: " + (err?.message || "unknown error"));
    }
  };

  if (loading || !profile) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  }

  const loadMyRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("account_change_requests")
      .select("id, request_type, status, new_username, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setMyRequests((data as any) || []);
  };

  const openSettings = async () => {
    setNewUsername(profile?.username || "");
    setCurrentPw("");
    setNewPw("");
    setSettingsOpen(true);
    await loadMyRequests();
  };

  const requestUsernameChange = async () => {
    if (!user) return;
    const u = newUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (u.length < 3) { toast.error("Username must be 3+ characters"); return; }
    if (u === profile?.username) { toast.error("That's already your username"); return; }
    setSubmittingUsername(true);
    const { data, error } = await supabase.functions.invoke("submit-account-request", {
      body: { type: "username", new_username: u },
    });
    setSubmittingUsername(false);
    if (error || (data as any)?.error) {
      toast.error(((data as any)?.error) || error?.message || "Could not submit request");
      return;
    }
    toast.success("Request sent to the owner for approval");
    loadMyRequests();
  };

  const requestPasswordChange = async () => {
    if (!user) return;
    if (!currentPw || newPw.length < 8) { toast.error("Enter current password and a new one (8+ characters)"); return; }
    setSubmittingPassword(true);
    const { data, error } = await supabase.functions.invoke("submit-account-request", {
      body: { type: "password", current_password: currentPw, new_password: newPw },
    });
    setSubmittingPassword(false);
    if (error || (data as any)?.error) {
      toast.error(((data as any)?.error) || error?.message || "Could not submit request");
      return;
    }
    setCurrentPw(""); setNewPw("");
    toast.success("Request sent to the owner for approval");
    loadMyRequests();
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {!isOwn && (
        <button
          onClick={() => openProfile(user!.id)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to my profile
        </button>
      )}

      {isOwn && (
        <div className="flex justify-end">
          <button
            onClick={openSettings}
            aria-label="Open settings"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
        </div>
      )}


      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div
          className="relative h-32 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/10 group/banner bg-cover bg-center"
          style={(profile as any).banner_url ? { backgroundImage: `url(${(profile as any).banner_url})` } : {}}
        >
          {isOwn && (
            <>
              <button
                onClick={() => bannerRef.current?.click()}
                className="absolute inset-0 bg-background/40 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center justify-center text-foreground"
                aria-label="Change banner"
              >
                <ImageIcon className="w-5 h-5 mr-2" /> <span className="text-sm font-medium">Change banner</span>
              </button>
              <input type="file" ref={bannerRef} hidden accept="image/*" onChange={handleBannerUpload} />
            </>
          )}
        </div>
        <div className="px-5 pb-5">
          <div className="flex items-end gap-4 -mt-10">
            <div className="relative group">
              <img
                src={profile.avatar_url || ""}
                alt={profile.display_name || ""}
                className="w-20 h-20 rounded-2xl object-cover border-4 border-card ring-2 ring-primary/30"
              />
              {isOwn && (
                <>
                  <button
                    onClick={() => avatarRef.current?.click()}
                    className="absolute inset-0 bg-background/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="w-6 h-6 text-foreground" />
                  </button>
                  <input type="file" ref={avatarRef} hidden accept="image/*" onChange={handleAvatarUpload} />
                </>
              )}
            </div>
            <div className="flex-1 pt-12">
              {editing && isOwn ? (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="text-xl font-bold bg-secondary text-foreground px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                />
              ) : (
                <h1 className="text-xl font-bold text-foreground flex items-center gap-1.5">
                  {profile.display_name}
                  <VerifiedBadge
                    verifiedUntil={(profile as any).verified_until}
                    isOwner={isOwn ? viewerIsOwner : false}
                    size="md"
                  />
                </h1>
              )}
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            </div>
            {isOwn ? (
              editing ? (
                <button onClick={handleSaveProfile} className="bg-primary text-primary-foreground px-4 py-1.5 rounded-xl text-sm font-semibold hover:opacity-90 mt-12">
                  Save
                </button>
              ) : (
                <button onClick={() => setEditing(true)} className="border border-primary text-primary px-4 py-1.5 rounded-xl text-sm font-semibold hover:bg-primary/10 transition-all mt-12">
                  Edit Profile
                </button>
              )
            ) : (
              <div className="flex gap-2 mt-12">
                <button
                  onClick={handleFollow}
                  className={isFollowing
                    ? "border border-border text-muted-foreground px-4 py-1.5 rounded-xl text-sm font-semibold hover:border-destructive hover:text-destructive transition-all"
                    : "bg-primary text-primary-foreground px-4 py-1.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <button
                  onClick={handleMessage}
                  className="border border-border text-foreground px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-secondary transition-all"
                  title="Message"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {editing && isOwn ? (
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full text-sm bg-secondary text-foreground/80 mt-4 p-2 rounded-lg outline-none resize-none min-h-[60px] focus:ring-2 focus:ring-primary/30"
              placeholder="Write your bio..."
            />
          ) : (
            <p className="text-sm text-foreground/80 mt-4">{profile.bio || "No bio yet"}</p>
          )}

          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Joined {new Date(profile.created_at || "").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </span>
          </div>
          <div className="flex gap-5 mt-4">
            <span className="text-sm"><strong className="text-foreground">{followingCount}</strong> <span className="text-muted-foreground">Following</span></span>
            <span className="text-sm"><strong className="text-foreground">{followerCount}</strong> <span className="text-muted-foreground">Followers</span></span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Posts</h3>
        {posts.length > 0 ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <p className="text-muted-foreground text-sm">No posts yet.</p>
          </div>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Account settings</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <p className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-2.5">
              Username and password changes are reviewed by the owner. You'll get a notification once your request is approved or denied.
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Change username</h3>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">@</span>
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="your_handle"
                  className="flex-1 bg-secondary text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">3+ characters, lowercase letters, numbers, underscore.</p>
              <button
                onClick={requestUsernameChange}
                disabled={submittingUsername}
                className="w-full mt-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingUsername && <Loader2 className="w-4 h-4 animate-spin" />} Request username change
              </button>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground">Change password</h3>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="w-full bg-secondary text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (8+ characters)"
                autoComplete="new-password"
                className="w-full bg-secondary text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={requestPasswordChange}
                disabled={submittingPassword}
                className="w-full mt-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingPassword && <Loader2 className="w-4 h-4 animate-spin" />} Request password change
              </button>
            </div>

            {myRequests.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent requests</h3>
                <div className="space-y-1.5">
                  {myRequests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs bg-secondary/50 px-3 py-2 rounded-lg">
                      <span className="text-foreground">{r.request_type}{r.new_username ? ` → @${r.new_username}` : ""}</span>
                      <span className={
                        r.status === "pending" ? "text-yellow-400 font-medium"
                        : r.status === "approved" ? "text-emerald-400 font-medium"
                        : "text-destructive font-medium"
                      }>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Privacy settings */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Cake className="w-4 h-4" /> Date of birth privacy</h3>
              <p className="text-[11px] text-muted-foreground">Kept private by default. You can share only your age, or your full birthday.</p>
              <select
                defaultValue={(profile as any).dob_visibility || "private"}
                onChange={async (e) => {
                  setSavingPrivacy(true);
                  await supabase.from("profiles").update({ dob_visibility: e.target.value } as any).eq("id", user!.id);
                  setSavingPrivacy(false);
                  await refreshProfile();
                  toast.success("Privacy updated");
                }}
                disabled={savingPrivacy}
                className="w-full bg-secondary text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="private">Private — only me</option>
                <option value="age_only">Show my age only</option>
                <option value="public">Show my full date of birth</option>
              </select>

              <label className="flex items-center justify-between gap-2 text-sm text-foreground pt-2">
                <span>Show ads in feed</span>
                <input type="checkbox" defaultChecked={(profile as any).ads_enabled !== false}
                  onChange={async (e) => {
                    await supabase.from("profiles").update({ ads_enabled: e.target.checked } as any).eq("id", user!.id);
                    await refreshProfile();
                    toast.success(e.target.checked ? "Ads enabled" : "Ads disabled");
                  }}
                  className="w-4 h-4 accent-primary" />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-foreground">
                <span>Show sensitive/adult content (18+)</span>
                <input type="checkbox" defaultChecked={(profile as any).adult_content === true}
                  onChange={async (e) => {
                    await supabase.from("profiles").update({ adult_content: e.target.checked } as any).eq("id", user!.id);
                    await refreshProfile();
                  }}
                  className="w-4 h-4 accent-primary" />
              </label>
            </div>

            {/* Verification apply */}
            {!isVerified((profile as any).verified_until, viewerIsOwner) && (
              <div className="border-t border-border pt-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-primary" /> Apply for verification
                </h3>
                <p className="text-[11px] text-muted-foreground">Tell the owner why you deserve a verified badge. Requests are reviewed manually.</p>
                <textarea
                  value={verificationReason}
                  onChange={(e) => setVerificationReason(e.target.value.slice(0, 1000))}
                  rows={3}
                  placeholder="Explain who you are, your public presence, and why verification matters (min 10 chars)…"
                  className="w-full bg-secondary text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">{verificationReason.length}/1000</p>
                <button
                  onClick={async () => {
                    if (verificationReason.trim().length < 10) { toast.error("Please write at least 10 characters"); return; }
                    setSubmittingVerification(true);
                    const { error } = await supabase.from("verification_requests" as any).insert({
                      user_id: user!.id, reason: verificationReason.trim(),
                    });
                    setSubmittingVerification(false);
                    if (error) { toast.error(error.message); return; }
                    setVerificationReason("");
                    toast.success("Verification request submitted to the owner");
                  }}
                  disabled={submittingVerification}
                  className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submittingVerification && <Loader2 className="w-4 h-4 animate-spin" />} Apply for badge
                </button>
              </div>
            )}

            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2 text-sm text-destructive border border-destructive/30 hover:bg-destructive/10 rounded-lg py-2 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
          <DialogFooter>
            <button onClick={() => setSettingsOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfileView;
