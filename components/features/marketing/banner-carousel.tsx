"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
const SWIPE_THRESHOLD_PX = 50;

// Bright, ultra-clean glass recipe
const GLASS =
  "border border-white/40 bg-white/40 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-black/40";

// Arrows hidden on mobile (hidden sm:flex) so they don't clutter the scaled-down 3:1 mobile banner
const GLASS_BUTTON = `${GLASS} absolute top-1/2 z-10 hidden sm:flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-foreground/80 transition-all duration-300 hover:scale-110 hover:bg-white/60 hover:text-primary hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 dark:hover:bg-black/50`;

export function BannerCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const playing = !paused && !reduceMotion && BANNERS.length > 1;

  const goTo = useCallback((i: number) => {
    setIndex((i + BANNERS.length) % BANNERS.length);
  }, []);

  // Respect "reduce motion" for accessibility
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Autoplay
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [playing, index]);

  // Touch swipe (Mobile users will use this instead of arrows)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    goTo(delta < 0 ? index + 1 : index - 1);
  };

  // Keyboard arrows
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goTo(index - 1);
    if (e.key === "ArrowRight") goTo(index + 1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="ATP Fitness highlights"
      className="relative w-full bg-background px-4 pt-28 pb-8 sm:px-6 sm:pt-32 sm:pb-12 lg:px-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{`@keyframes atp-banner-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>

      {/* 
        CRITICAL FIX: Removed min-h-[400px] and enforced aspect-[3/1] globally.
        Now, a 2172x724 image will perfectly scale down on mobile without side cropping.
      */}
      <div className="mx-auto max-w-[1920px] relative overflow-hidden rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full aspect-[3/1] bg-muted/20 border border-border/40">
        {BANNERS.map((banner, i) => {
          const content = (
            <Image
              src={banner.src}
              alt={banner.alt}
              fill
              priority={i === 0}
              sizes="100vw"
              unoptimized
              className="object-cover transition-transform duration-1000 ease-out"
              style={{
                transform: i === index ? "scale(1)" : "scale(1.03)",
              }}
            />
          );
          return (
            <div
              key={banner.src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${BANNERS.length}`}
              className="absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none"
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
            </div>
          );
        })}

        {/* Shorter bottom shadow for mobile so it doesn't darken the whole tiny banner */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16 sm:h-32 bg-gradient-to-t from-black/10 to-transparent" />

        {BANNERS.length > 1 && (
          <>
            {/* Prev / next (Hidden on mobile via 'hidden sm:flex' in GLASS_BUTTON) */}
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous banner"
              className={`${GLASS_BUTTON} left-6`}
            >
              <ChevronLeft className="h-6 w-6 stroke-[2.5px]" />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next banner"
              className={`${GLASS_BUTTON} right-6`}
            >
              <ChevronRight className="h-6 w-6 stroke-[2.5px]" />
            </button>

            {/* Scoreboard counter — bottom-left (Scaled down heavily for mobile) */}
            <div
              className={`${GLASS} absolute bottom-2 left-2 z-10 flex items-center gap-1.5 sm:gap-2.5 rounded-full px-2.5 py-1 sm:bottom-6 sm:left-6 sm:px-4 sm:py-2`}
            >
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary"></span>
              </span>
              <span className="font-mono text-[10px] font-bold tracking-widest text-foreground sm:text-sm">
                {String(index + 1).padStart(2, "0")}
                <span className="text-foreground/40 font-medium"> / {String(BANNERS.length).padStart(2, "0")}</span>
              </span>
            </div>

            {/* Progress dots — bottom-right (Scaled down heavily for mobile) */}
            <div
              className={`${GLASS} absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 sm:bottom-6 sm:right-6 sm:gap-2 sm:px-4 sm:py-3`}
            >
              {BANNERS.map((banner, i) => {
                const active = i === index;
                return (
                  <button
                    key={banner.src}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Go to banner ${i + 1}`}
                    aria-current={active ? "true" : undefined}
                    className={`relative h-1 overflow-hidden rounded-full transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-1.5 ${
                      active ? "w-6 bg-foreground/20 sm:w-10" : "w-1.5 bg-foreground/30 hover:bg-foreground/50 hover:w-3 sm:w-2 sm:hover:w-4"
                    }`}
                  >
                    {active && (
                      <span
                        key={index}
                        className="absolute inset-0 origin-left rounded-full bg-primary"
                        style={
                          playing
                            ? { animation: `atp-banner-progress ${AUTOPLAY_MS}ms linear forwards` }
                            : { transform: "scaleX(1)" }
                        }
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}