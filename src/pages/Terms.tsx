import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <h1 className="text-4xl font-bold mb-2">Terms & Conditions</h1>
      <p className="text-muted-foreground mb-8">Last updated: June 16, 2026</p>

      <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>By creating an account on Socialite ("the Service"), you agree to be bound by these Terms & Conditions and our Community Guidelines. If you do not agree, do not use the Service.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">2. Eligibility</h2>
          <p>You must be at least 13 years old to use Socialite. By signing up you represent that you meet this requirement and that the information you provide is accurate.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">3. Your Account</h2>
          <p>You are responsible for safeguarding your password and for any activity under your account. Notify us immediately of any unauthorized use.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">4. User Content</h2>
          <p>You retain ownership of content you post, but grant Socialite a worldwide, royalty-free license to host, display, and distribute that content within the Service. You are solely responsible for what you upload.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">5. Prohibited Conduct</h2>
          <p>You agree not to: post illegal, hateful, sexually explicit, or harassing content; impersonate others; scrape or abuse the platform; attempt to bypass moderation; or use the Service to distribute malware.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">6. Moderation & Enforcement</h2>
          <p>Socialite reserves the right to remove content, shadow ban, suspend, or permanently terminate any account that violates these Terms or the Community Guidelines, at our sole discretion and without prior notice.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">7. Termination</h2>
          <p>You may delete your account at any time. We may suspend or terminate your access for any reason, including violation of these Terms.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">8. Disclaimer & Liability</h2>
          <p>The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, Socialite is not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">9. Changes to Terms</h2>
          <p>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">10. Contact</h2>
          <p>Questions about these Terms? Contact the platform owner via the in-app messaging system.</p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
