import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const MIN_AGE = 13;

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const computeAge = (d: string) => {
    if (!d) return 0;
    const b = new Date(d);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
    return age;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      if (!acceptTerms) {
        toast.error("You must accept the Terms & Community Guidelines to sign up.");
        return;
      }
      if (!dob) { toast.error("Please enter your date of birth."); return; }
      const age = computeAge(dob);
      if (age < MIN_AGE) { toast.error(`You must be at least ${MIN_AGE} years old to join.`); return; }
      if (age > 120) { toast.error("Please enter a valid date of birth."); return; }
    }
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, username, displayName, dob);
        try {
          await signIn(email, password);
          toast.success("Welcome to Socialite!");
          navigate("/");
        } catch {
          toast.success("Account created. Please sign in.");
          setIsSignUp(false);
        }
      } else {
        await signIn(email, password);
        toast.success("Welcome back!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // 13+ enforcement: block picking a date that makes user under MIN_AGE
  const today = new Date();
  const maxDob = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10);
  const minDob = new Date(today.getFullYear() - 120, 0, 1).toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center glow-primary mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-2xl">S</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Socialite — {isSignUp ? "Create your account" : "Sign in"}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{isSignUp ? "Join the community" : "Welcome back"}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="Alex Rivera"
                  className="w-full bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} required placeholder="alexrivera"
                  className="w-full bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Date of birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  min={minDob}
                  max={maxDob}
                  className="w-full bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Kept private by default. You can choose to show your age later in settings.
                </p>
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com"
              className="w-full bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••"
                className="w-full bg-secondary text-foreground text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 transition-all pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <label className="flex items-start gap-3 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary cursor-pointer shrink-0" required />
              <span>
                I agree to Socialite's{" "}
                <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">Terms &amp; Conditions</Link>{" "}and{" "}
                <Link to="/community-guidelines" target="_blank" className="text-primary hover:underline font-medium">Community Guidelines</Link>.
              </span>
            </label>
          )}

          <button type="submit" disabled={loading || (isSignUp && !acceptTerms)}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 glow-primary">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSignUp ? "Create account" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary font-semibold hover:underline">
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;
