import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  verifiedUntil?: string | null;
  isOwner?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Sole owner is always verified. Everyone else needs verified_until in the future (or 'infinity'). */
export const isVerified = (verifiedUntil?: string | null, isOwner?: boolean) => {
  if (isOwner) return true;
  if (!verifiedUntil) return false;
  if (verifiedUntil.startsWith("infinity")) return true;
  return new Date(verifiedUntil).getTime() > Date.now();
};

const VerifiedBadge = ({ verifiedUntil, isOwner, size = "sm", className }: VerifiedBadgeProps) => {
  if (!isVerified(verifiedUntil, isOwner)) return null;
  const px = size === "sm" ? "w-3.5 h-3.5" : size === "md" ? "w-4 h-4" : "w-5 h-5";
  return (
    <BadgeCheck
      aria-label={isOwner ? "Owner verified" : "Verified account"}
      className={cn(px, "text-primary fill-primary/20 shrink-0", className)}
    />
  );
};

export default VerifiedBadge;
