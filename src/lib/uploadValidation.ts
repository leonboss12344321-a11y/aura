// Client-side image upload guardrails. Server should enforce the same limits.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WebP, or GIF images are allowed.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Image must be smaller than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`;
  }
  return null;
}
