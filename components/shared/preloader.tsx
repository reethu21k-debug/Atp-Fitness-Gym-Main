"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "atp-preloader-seen"; // must match the key in the layout boot script
const DISPLAY_MS = 5000; // one full play of preloader.gif, counted from when the GIF actually starts
const FADE_MS = 500;
const MAX_LOAD_WAIT_MS = 4000; // safety: never block the site if the GIF fails to load

export function Preloader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [started, setStarted] = useState(false); // true once the GIF is on screen
  const imgRef = useRef<HTMLImageElement>(null);

  // Setup: skip if already seen, lock scroll, detect when the GIF is ready
  useEffect(() => {
    const root = document.documentElement;

    if (root.hasAttribute("data-preloaded")) {
      setVisible(false);
      return;
    }

    document.body.style.overflow = "hidden";

    // Cached GIF may already be loaded before React attaches onLoad
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setStarted(true);
    }

    // Fallback so a failed/slow GIF can't trap the user on the preloader
    const safety = setTimeout(() => setStarted(true), MAX_LOAD_WAIT_MS);

    return () => {
      clearTimeout(safety);
      document.body.style.overflow = "";
    };
  }, []);

  // Start the 5s clock only after the GIF has begun playing
  useEffect(() => {
    if (!started) return;
    const root = document.documentElement;

    const fadeTimer = setTimeout(() => setFading(true), DISPLAY_MS);
    const removeTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {}
      root.setAttribute("data-preloaded", "1");
      document.body.style.overflow = "";
      setVisible(false);
    }, DISPLAY_MS + FADE_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [started]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity ease-out [[data-preloaded]_&]:hidden"
      style={{
        opacity: fading ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        pointerEvents: fading ? "none" : "auto",
      }}
      aria-hidden={fading}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src="/preloader.gif"
        alt="ATP Fitness loading"
        className="object-contain"
        style={{ width: "clamp(260px, 32vw, 620px)", height: "clamp(260px, 32vw, 620px)" }}
        onLoad={() => setStarted(true)}
        onError={() => setStarted(true)}
      />
    </div>
  );
}