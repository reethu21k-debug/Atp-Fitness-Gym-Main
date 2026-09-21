"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "atp-preloader-seen"; // must match the key in the layout boot script
// Set this to ONE full play of preloader.gif. If the gif is shorter than this, it loops inside the window.
const DISPLAY_MS = 4600;
const FADE_MS = 500;

export function Preloader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    // Already played this session -> never show again (the layout boot script sets this before first paint)
    if (root.hasAttribute("data-preloaded")) {
      setVisible(false);
      return;
    }

    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = "";
    };
  }, []);

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
        src="/preloader.gif"
        alt="ATP Fitness loading"
        className="object-contain"
        style={{ width: "clamp(260px, 32vw, 620px)", height: "clamp(260px, 32vw, 620px)" }}
      />
    </div>
  );
}