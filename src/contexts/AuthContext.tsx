import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Profile = Tables<"profiles">;
type AppRole = "owner" | "admin" | "moderator";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  isStaff: boolean;
  isOwner: boolean;
  loading: boolean;
  signUp: (email: string, password: string, username: string, displayName: string, dob?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    // Uses a SECURITY DEFINER RPC so this call is the only path to the caller's private
    // fields (date_of_birth, suspension/shadow-ban flags). Direct SELECT on `profiles`
    // has been restricted at the column level for other users.
    const { data: rows } = await supabase.rpc("get_my_profile");
    const data = (rows && (rows as any[])[0]) || null;

    // Enforce suspension / deletion
    if (data?.is_deleted) {
      toast.error("This account has been removed.");
      await supabase.auth.signOut();
      return;
    }
    if (data?.is_suspended) {
      const until = data.suspended_until ? new Date(data.suspended_until) : null;
      if (!until || until > new Date()) {
        toast.error(
          until
            ? `Account suspended until ${until.toLocaleString()}.`
            : "Account suspended."
        );
        await supabase.auth.signOut();
        return;
      }
    }
    setProfile(data);

    // Fetch highest role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const priority: AppRole[] = ["owner", "admin", "moderator"];
    const top = priority.find((r) => roles?.some((x: any) => x.role === r)) ?? null;
    setRole(top);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, username: string, displayName: string, dob?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
    // Stamp terms acceptance + DOB once profile row exists (handle_new_user trigger creates it)
    if (data.user) {
      setTimeout(async () => {
        const patch: any = { accepted_terms_at: new Date().toISOString() };
        if (dob) patch.date_of_birth = dob;
        await supabase.from("profiles").update(patch).eq("id", data.user!.id);
      }, 500);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role,
        isStaff: role !== null,
        isOwner: role === "owner",
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
