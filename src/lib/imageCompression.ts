// Client-side image compression. Resizes large images and re-encodes as JPEG (or keeps PNG/WebP)
// to drastically reduce upload size while preserving visible quality.

export interface CompressOptions {
  maxDimension?: number;   // longest edge in pixels
  quality?: number;        // 0..1 for JPEG/WebP
  mimeType?: "image/jpeg" | "image/webp";
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1600,
  quality: 0.82,
  mimeType: "image/jpeg",
};

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, mimeType } = { ...DEFAULTS, ...opts };
  // Don't recompress GIFs (would lose animation) or tiny files (<150 KB)
  if (file.type === "image/gif" || file.size < 150 * 1024) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
  if (!blob) return file;

  // If compression somehow grew the file, keep the original.
  if (blob.size >= file.size) return file;

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: mimeType, lastModified: Date.now() });
}
