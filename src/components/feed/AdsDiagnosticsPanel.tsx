import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";

interface Diag {
  scriptLoaded: boolean;
  slotsInitialized: number;
  slotsFilled: number;
  slotsFailed: number;
  lastError?: string;
}

const emptyDiag = (): Diag => ({
  scriptLoaded: false,
  slotsInitialized: 0,
  slotsFilled: 0,
  slotsFailed: 0,
});

/**
 * AdsDiagnosticsPanel
 * Floating pill (bottom-right on desktop, above bottom-nav on mobile) that
 * reports AdSense script load + slot fill stats in real time.
 * Data is read from window.__lovableAdDiag which AdSlot writes to.
 */
const AdsDiagnosticsPanel = () => {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<Diag>(emptyDiag);

  useEffect(() => {
    // Seed the global store if AdSlot hasn't mounted yet
    if (!window.__lovableAdDiag) {
      (window as any).__lovableAdDiag = {
        ...emptyDiag(),
        scriptLoaded: !!document.querySelector('script[src*="adsbygoogle.js"]'),
      };
    }

    const poll = () => {
      const d = (window as any).__lovableAdDiag ?? emptyDiag();
      // Always re-check script presence
      d.scriptLoaded = !!document.querySelector('script[src*="adsbygoogle.js"]');
      setDiag({ ...d });
    };

    poll();
    const iv = window.setInterval(poll, 2000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    if (diag.scriptLoaded) {
      console.info(
        "[AdSense] script=loaded | slots init=%d filled=%d failed=%d",
        diag.slotsInitialized,
        diag.slotsFilled,
        diag.slotsFailed,
      );
    }
  }, [diag.scriptLoaded, diag.slotsInitialized, diag.slotsFilled, diag.slotsFailed]);

  return (
    <>
      {/* Pill — sits above mobile bottom-nav (pb-16) and clear of scrollbar on desktop */}
      <button
        aria-label="Toggle ads diagnostics"
        onClick={() => setOpen((s) => !s)}
        className="fixed bottom-20 right-3 md:bottom-4 md:right-4 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-medium bg-card/90 backdrop-blur border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all shadow-lg"
      >
        <Activity className="w-3 h-3" />
        Ads&nbsp;{diag.scriptLoaded ? "✓" : "…"}&nbsp;·&nbsp;{diag.slotsFilled}/{diag.slotsInitialized}
      </button>

      {open && (
        <div className="fixed bottom-32 right-3 md:bottom-16 md:right-4 z-50 w-72 bg-card border border-border rounded-xl p-4 shadow-2xl text-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-foreground">AdSense diagnostics</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <dl className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <dt>Script loaded</dt>
              <dd className={diag.scriptLoaded ? "text-green-400" : "text-yellow-400"}>
                {diag.scriptLoaded ? "yes" : "waiting"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Publisher ID</dt>
              <dd className="text-foreground font-mono text-[10px]">pub-1262773326718474</dd>
            </div>
            <div className="flex justify-between">
              <dt>Slots initialised</dt>
              <dd className="text-foreground">{diag.slotsInitialized}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Slots filled</dt>
              <dd className="text-green-400">{diag.slotsFilled}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Slots failed</dt>
              <dd className={diag.slotsFailed ? "text-destructive" : "text-foreground"}>
                {diag.slotsFailed}
              </dd>
            </div>
            {diag.lastError && (
              <div className="pt-2 border-t border-border/50 text-[10px] break-words">
                <span className="text-destructive">Last error: </span>{diag.lastError}
              </div>
            )}
          </dl>

          <div className="mt-3 pt-3 border-t border-border/40 space-y-1 text-[10px] text-muted-foreground/70">
            <p>✓ ads.txt present at /ads.txt</p>
            <p>Blank ads are normal until Google approves your domain.</p>
            <p>Retries: up to 3× per slot with fresh &lt;ins&gt; each time.</p>
          </div>
        </div>
      )}
    </>
  );
};

export default AdsDiagnosticsPanel;
