// Client-side content moderation. Best-effort protection — server-side review still matters.
// Uses nsfwjs (MobileNet) for image nudity classification, lazily loaded to keep initial bundle light.
import type { NSFWJS } from "nsfwjs";

let modelPromise: Promise<NSFWJS> | null = null;

async function getModel(): Promise<NSFWJS> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, nsfw] = await Promise.all([
        import("@tensorflow/tfjs"),
        import("nsfwjs"),
      ]);
      await tf.ready();
      // Public CDN-hosted quantized MobileNet v2 model.
      return await nsfw.load("https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/example/nsfw_demo/public/model/", { size: 224 } as any).catch(async () => {
        // Fallback to default model
        return await nsfw.load();
      });
    })();
  }
  return modelPromise;
}

export type NsfwVerdict = {
  allowed: boolean;
  reason?: string;
  scores: Record<string, number>;
  isAdult: boolean;
};

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke later, after classify reads pixels
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/**
 * Classify an image for nudity/porn/hentai. Blocks hard content always; blocks sexy content
 * for minors. Never throws to the caller — on model failure, allows upload (fail-open) so a
 * flaky CDN doesn't lock users out; server-side moderation and reports remain the safety net.
 */
export async function moderateImage(file: File, opts: { userAge?: number | null; allowAdult?: boolean } = {}): Promise<NsfwVerdict> {
  const empty: NsfwVerdict = { allowed: true, scores: {}, isAdult: false };
  try {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return empty;
    const model = await getModel();
    const img = await fileToImage(file);
    const preds = await model.classify(img);
    const scores: Record<string, number> = {};
    preds.forEach((p) => { scores[p.className] = p.probability; });
    const porn = scores["Porn"] ?? 0;
    const hentai = scores["Hentai"] ?? 0;
    const sexy = scores["Sexy"] ?? 0;
    const isAdult = porn > 0.6 || hentai > 0.6 || sexy > 0.75;

    // Hard block: explicit content is not allowed at all.
    if (porn > 0.6 || hentai > 0.6) {
      return { allowed: false, reason: "Explicit content is not allowed.", scores, isAdult: true };
    }
    // Age gating for suggestive content.
    const age = opts.userAge ?? null;
    if (sexy > 0.75 && (age === null || age < 18)) {
      return { allowed: false, reason: "This image looks suggestive and cannot be uploaded from a non-verified-adult account.", scores, isAdult: true };
    }
    return { allowed: true, scores, isAdult };
  } catch {
    return empty;
  }
}

// Basic slang/profanity guard. Kept intentionally short — server moderation should be
// authoritative. Matches whole words, case-insensitive, ignores common false-positive stems.
const SLANG_WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "cunt", "slut", "whore",
  "faggot", "nigger", "nigga", "retard", "chink", "spic", "kike", "tranny",
];
const SLANG_RE = new RegExp(`\\b(${SLANG_WORDS.join("|")})\\b`, "i");

export function containsSlang(text: string): boolean {
  return SLANG_RE.test(text || "");
}

export function scrubSlang(text: string): string {
  return (text || "").replace(new RegExp(`\\b(${SLANG_WORDS.join("|")})\\b`, "gi"), (m) => "*".repeat(m.length));
}

export function computeAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
