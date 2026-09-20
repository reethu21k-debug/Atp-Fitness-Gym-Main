"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Banner images live directly in /public at 2172x724px (3:1 ratio).
const BANNERS = [
  { src: "/banner-1.png", alt: "ATP Fitness banner 1", href: "" },
  { src: "/banner-3.png", alt: "ATP Fitness banner 3", href: "" },
  { src: "/banner-4.png", alt: "ATP Fitness banner 4", href: "" },
  { src: "/banner-8.png", alt: "ATP Fitness banner 8", href: "" },
  { src: "/banner-10.png", alt: "ATP Fitness banner 10", href: "" },
  { src: "/banner-11.png", alt: "ATP Fitness banner 11", href: "" },
  { src: "/banner-14.png", alt: "ATP Fitness banner 14", href: "" },
  { src: "/banner-16.png", alt: "ATP Fitness banner 16", href: "" },
];

const AUTOPLAY_MS = 4500;

export function BannerCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((i: number) => {
    setIndex((i + BANNERS.length) % BANNERS.length);
  }, []);

  useEffect(() => {
    if (BANNERS.length <= 1 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <section
      className="relative w-full overflow-hidden bg-[#1A1006]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[3/1] w-full">
        {BANNERS.map((banner, i) => {
          const content = (
            <Image
              src={banner.src}
              alt={banner.alt}
              fill
              priority={i === 0}
              sizes="100vw"
              className="object-cover"
            />
          );
          return (
            <div
              key={banner.src}
              className="absolute inset-0 transition-opacity duration-500"
              style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? "auto" : "none" }}
              aria-hidden={i !== index}
            >
              {banner.href ? (
                <a href={banner.href} className="block h-full w-full">
                  {content}
                </a>
              ) : (
                content
              )}
              {/* Vignette so scoreboard chrome stays legible over any artwork */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
            </div>
          );
        })}

        {BANNERS.length > 1 && (
          <>
            {/* Scoreboard slide counter, top-left, bolted-on-clock style */}
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-sm border border-[#FF8A1F]/40 bg-[#1A1006]/85 px-3 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00]" />
              <span className="font-mono-score text-xs font-semibold tracking-wider text-[#FF8A1F]">
                {String(index + 1).padStart(2, "0")}
                <span className="text-[#FFFAF6]/50"> / {String(BANNERS.length).padStart(2, "0")}</span>
              </span>
            </div>

            {/* Squared, rack-style prev/next controls */}
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous banner"
              className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm border border-white/15 bg-[#1A1006]/70 text-[#FFFAF6] backdrop-blur-sm transition hover:border-[#FF6A00]/70 hover:bg-[#FF6A00]/20 hover:text-[#FF8A1F]"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next banner"
              className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm border border-white/15 bg-[#1A1006]/70 text-[#FFFAF6] backdrop-blur-sm transition hover:border-[#FF6A00]/70 hover:bg-[#FF6A00]/20 hover:text-[#FF8A1F]"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}