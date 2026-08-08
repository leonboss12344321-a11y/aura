import { useEffect, useRef, useState } from "react";

interface AdSlotProps {
  slot?: string;        // numeric AdSense slot ID — leave blank for auto/house ad
  format?: string;
  className?: string;
}

const AD_CLIENT = "ca-pub-1262773326718474";
const MAX_RETRIES = 3;
const FILL_CHECK_MS = 2000;
const RETRY_DELAY_MS = 2500;

declare global {
  interface Window {
    adsbygoogle?: any[];
    __lovableAdDiag?: {
      scriptLoaded: boolean;
      slotsInitialized: number;
      slotsFilled: number;
      slotsFailed: number;
      lastError?: string;
    };
  }
}

const ensureDiag = () => {
  if (!window.__lovableAdDiag) {
    window.__lovableAdDiag = {
      scriptLoaded: !!document.querySelector('script[src*="adsbygoogle.js"]'),
      slotsInitialized: 0,
      slotsFilled: 0,
      slotsFailed: 0,
    };
  }
  return window.__lovableAdDiag;
};

/**
 * AdSlot — renders a single Google AdSense <ins> element.
 *
 * ⚠️  IMPORTANT: `slot` must be a numeric string from your AdSense account
 *     (e.g. slot="1234567890").  A missing or non-numeric slot will silently
 *     produce empty ads.  Blank ads before domain approval are expected.
 *
 * AdSense requires a completely fresh <ins> element for each push attempt,
 * so retries are handled by unmounting/remounting via a key-bump rather than
 * mutating the existing element.
 */
const AdSlot = ({ slot, format = "auto", className = "" }: AdSlotProps) => {
  const [attempt, setAttempt] = useState(0);   // bump to remount <ins>
  const [status, setStatus] = useState<"pending" | "filled" | "failed">("pending");
  const insRef = useRef<HTMLModElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (attempt >= MAX_RETRIES) return;

    const diag = ensureDiag();
    diag.scriptLoaded = !!document.querySelector('script[src*="adsbygoogle.js"]');

    const push = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        diag.slotsInitialized += 1;
      } catch (err: any) {
        diag.lastError = err?.message ?? String(err);
        console.warn("[AdSense] push error:", err);
      }

      // Check fill status after giving AdSense time to respond
      timerRef.current = setTimeout(() => {
        const el = insRef.current as HTMLElement | null;
        const adStatus = el?.getAttribute("data-ad-status");
        if (adStatus === "filled") {
          diag.slotsFilled += 1;
          setStatus("filled");
        } else if (attempt + 1 < MAX_RETRIES) {
          // Remount the <ins> by bumping the key
          timerRef.current = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY_MS);
        } else {
          diag.slotsFailed += 1;
          setStatus("failed");
        }
      }, FILL_CHECK_MS);
    };

    // Wait for AdSense script to be present before first push
    if (window.adsbygoogle || document.querySelector('script[src*="adsbygoogle.js"]')) {
      push();
    } else {
      timerRef.current = setTimeout(push, 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <aside
      aria-label="Advertisement"
      className={`bg-card/60 border border-border/60 rounded-2xl overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 select-none">
          Sponsored
        </span>
        {status === "failed" && (
          <span className="text-[10px] text-muted-foreground/40">Ad unavailable</span>
        )}
      </div>
      <div className="px-3 pb-3 pt-1 min-h-[90px]">
        {/* key forces a fresh <ins> on each retry attempt */}
        <ins
          key={`ad-${slot}-${attempt}`}
          ref={insRef as any}
          className="adsbygoogle block w-full"
          style={{ display: "block", minHeight: 90 }}
          data-ad-client={AD_CLIENT}
          data-ad-slot={slot ?? ""}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
};

export default AdSlot;
