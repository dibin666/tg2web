import React from "react";
import { cn } from "@/lib/utils";

/* Lobe-style rounded-square avatars with warm Claude-adjacent gradients */
const GRADIENTS = [
  "linear-gradient(135deg, #e59a70 0%, #c05f3f 100%)", // terracotta
  "linear-gradient(135deg, #a7c3b9 0%, #6f958a 100%)", // sage
  "linear-gradient(135deg, #8db4d9 0%, #5d82ab 100%)", // sky
  "linear-gradient(135deg, #c2b96d 0%, #8f8d4f 100%)", // olive
  "linear-gradient(135deg, #b9a3d0 0%, #8a6fae 100%)", // fig
  "linear-gradient(135deg, #d9a27a 0%, #a86a3f 100%)", // clay
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

interface BotAvatarProps {
  id: string;
  title: string;
  size?: number;
  className?: string;
}

export const BotAvatar: React.FC<BotAvatarProps> = ({ id, title, size = 40, className }) => {
  const gradient = GRADIENTS[hashString(id) % GRADIENTS.length];
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-semibold text-white shadow-sm",
        className
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(10, size * 0.3),
        backgroundImage: gradient,
        fontSize: size * 0.36,
      }}
    >
      {initials || "?"}
    </div>
  );
};
