import { useState, useRef, useEffect } from "react";
import { Image, Smile, Send, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { validateImageFile } from "@/lib/uploadValidation";
import { compressImage } from "@/lib/imageCompression";

interface CreatePostProps {
  onPost: (
    content: string,
    imageFile: File | undefined,
    onProgress: (pct: number, label?: string) => void,
  ) => Promise<void> | void;
}

const CreatePost = ({ onPost }: CreatePostProps) => {
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const tickerRef = useRef<number | null>(null);
  const { profile } = useAuth();

  useEffect(() => () => { if (tickerRef.current) window.clearInterval(tickerRef.current); }, []);

  const handleProgress = (pct: number, label?: string) => {
    setProgress(pct);
    if (label !== undefined) setProgressLabel(label);
  };

  const handleSubmit = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    setProgress(imageFile ? 5 : 0);
    setProgressLabel(imageFile ? "Preparing…" : "Posting…");
    // Simulated smooth progress ticker while the upload is in flight (Supabase storage
    // does not expose granular upload events). onProgress() calls jump to real milestones.
    if (imageFile) {
      tickerRef.current = window.setInterval(() => {
        setProgress((p) => (p < 85 ? p + 2 : p));
      }, 250);
    }
    try {
      await onPost(content, imageFile || undefined, handleProgress);
      setProgress(100);
      setContent(""); setImageFile(null); setImagePreview(null);
    } finally {
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
      window.setTimeout(() => { setBusy(false); setProgress(0); setProgressLabel(""); }, 400);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { toast.error(err); e.target.value = ""; return; }
    try {
      const compressed = await compressImage(file, { maxDimension: 1800, quality: 0.85 });
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
      if (compressed.size < file.size) {
        const pct = Math.round((1 - compressed.size / file.size) * 100);
        toast.success(`Image optimized (${pct}% smaller)`);
      }
    } catch {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex gap-3">
        <img src={profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"} alt="You"
          className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/30" />
        <div className="flex-1">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's on your mind?"
            className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground resize-none outline-none min-h-[80px]" />
          {imagePreview && (
            <div className="relative mb-3">
              <img src={imagePreview} alt="Preview" className="rounded-xl max-h-48 object-cover" />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute top-2 right-2 bg-background/80 p-1 rounded-full text-foreground hover:bg-background">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {busy && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>{progressLabel || "Uploading…"}</span>
                <span className="tabular-nums text-foreground/80">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200 ease-out"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex gap-1">
              <input type="file" ref={fileRef} hidden accept="image/*" onChange={handleImageSelect} />
              <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                <Image className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg text-muted-foreground hover:text-warning hover:bg-yellow-500/10 transition-all">
                <Smile className="w-4 h-4" />
              </button>
            </div>
            <button onClick={handleSubmit} disabled={!content.trim() || busy}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;
