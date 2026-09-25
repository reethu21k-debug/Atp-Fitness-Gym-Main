"use client";

import { cn } from "@/lib/utils/cn";

const VIDEO_ID = "VuAcJwZ0AMo";

const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

export default function PodcastVideo() {
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-[2rem] bg-black", glass)}
      style={{ paddingBottom: "56.25%" /* 16:9 ratio, forces height */ }}
    >
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube.com/embed/${VIDEO_ID}`}
        title="The reality of owning a gym — ATP Fitness podcast"
        allow="accelerate-motion; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}