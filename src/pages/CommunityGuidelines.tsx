import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Heart, Ban, Flag } from "lucide-react";

const CommunityGuidelines = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <h1 className="text-4xl font-bold mb-2">Community Guidelines</h1>
      <p className="text-muted-foreground mb-8">The rules that keep Socialite a place worth being in.</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
          <Heart className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">Be respectful</h2>
            <p className="text-muted-foreground">Treat every member with dignity. No harassment, slurs, hate speech, threats, or targeted abuse — ever.</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
          <Shield className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">Keep it safe</h2>
            <p className="text-muted-foreground">No sexually explicit content, graphic violence, self-harm content, or material that endangers minors. Share private information only with consent.</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
          <Ban className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">No spam or manipulation</h2>
            <p className="text-muted-foreground">No bots, mass-DMs, fake engagement, scams, phishing, malware, or attempts to manipulate the feed or follower counts.</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex gap-4">
          <Flag className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">Be authentic</h2>
            <p className="text-muted-foreground">Don't impersonate others. Don't post content that infringes someone else's copyright. Credit creators when you share their work.</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-base mb-2">Enforcement</h2>
          <p className="text-muted-foreground">Violations may result in content removal, a shadow ban (your posts stop appearing to others), temporary suspension, or permanent account termination — at the owner's sole discretion.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-base mb-2">Reporting</h2>
          <p className="text-muted-foreground">See something that breaks the rules? Reach out through the in-app messaging system. We review reports as fast as we can.</p>
        </div>
      </div>
    </div>
  </div>
);

export default CommunityGuidelines;
