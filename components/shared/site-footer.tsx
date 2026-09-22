"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Clock, MapPin, Instagram, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const COLUMNS = [
  {
    title: "Gym",
    links: [
      { href: "/features", label: "Facilities & classes" },
      { href: "/pricing", label: "Membership plans" },
      { href: "/gallery", label: "Gallery" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/testimonials", label: "Member stories" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Members",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/contact", label: "Book a free trial" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

// Direct Google Maps Route Link
const DIRECTIONS_URL = "https://maps.app.goo.gl/MgDqHjbYz5gzprad9";

const INSTAGRAM_URL = "https://www.instagram.com/atpfitness___/";

// Visible keyboard focus for every footer link
const focusRing =
  "rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-background px-4 pb-8 pt-16 selection:bg-primary/30 sm:px-6 sm:pb-12 sm:pt-24">
      {/* --- Ambient Background Glow Effects --- */}
      <div className="pointer-events-none absolute -left-20 top-1/4 h-80 w-80 rounded-full bg-primary/15 blur-[120px] sm:left-0 sm:h-96 sm:w-96" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-blue-500/10 blur-[120px] sm:right-0 sm:h-96 sm:w-96" />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* --- Main Glass Container --- */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 bg-gradient-to-b from-background/80 via-background/50 to-background/90 p-6 sm:p-10 lg:p-12 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-2xl dark:border-white/10 dark:from-white/[0.04] dark:to-white/[0.01]">
          
          {/* Subtle top highlights line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 lg:grid-cols-[1.7fr_repeat(4,minmax(0,1fr))] lg:gap-x-8">
            
            {/* --- Column 1: Brand & Location --- */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <Link href="/" className={cn("inline-flex items-center group transition-transform duration-300 hover:scale-[1.02]", focusRing)}>
                <Image
                  src="/logo.png"
                  alt="ATP Fitness"
                  width={1350}
                  height={901}
                  className="h-12 w-auto sm:h-14 drop-shadow-md"
                />
              </Link>

              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground/90 font-normal">
                Strength training, group classes, and personal coaching — open every day to transform your body and mindset.
              </p>

              {/* Location & Operating Hours Pills */}
              <address className="mt-6 space-y-3 text-sm not-italic">
                <div className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/30 p-3 backdrop-blur-sm transition-colors hover:border-border/80">
                  <span className="mt-0.5 shrink-0 rounded-xl bg-primary/10 p-2 text-primary shadow-sm">
                    <MapPin className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    TCR Towers, 15/704, Main Rd, near Mayur Lodge, Kamalanagar, Anantapur, AP 515001
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/30 p-3 backdrop-blur-sm transition-colors hover:border-border/80">
                  <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary shadow-sm">
                    <Clock className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    <span className="font-semibold text-foreground">Open Daily:</span> 5:00 AM – 11:00 PM
                  </span>
                </div>
              </address>

              {/* Interactive Action Badges */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-all duration-300 hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/20",
                    focusRing
                  )}
                >
                  <span>Get directions</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </a>

                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-4 py-2 text-xs font-semibold text-muted-foreground transition-all duration-300 hover:border-primary/50 hover:bg-background/80 hover:text-foreground hover:shadow-md",
                    focusRing
                  )}
                  aria-label="ATP Fitness Instagram Profile"
                >
                  <Instagram className="h-3.5 w-3.5 text-primary transition-transform duration-300 group-hover:scale-110" aria-hidden />
                  <span>Instagram</span>
                  <ArrowUpRight
                    className="h-3 w-3 opacity-60 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden
                  />
                </a>
              </div>
            </div>

            {/* --- Link Columns --- */}
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title} className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {col.title}
                  </h2>
                </div>

                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className={cn(
                          "group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-all duration-200 hover:translate-x-1.5 hover:text-primary",
                          focusRing
                        )}
                      >
                        <ChevronRight className="h-3 w-3 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:text-primary" />
                        <span className="-ml-3 transition-all duration-200 group-hover:ml-0">
                          {link.label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* --- Bottom Footer Bar --- */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 text-center sm:flex-row sm:text-left">
            
            {/* Copyright & Agency Badge */}
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} ATP Fitness. All rights reserved.
              </p>
              
              <span className="hidden text-border/60 sm:inline">•</span>

              {/* Stryvenix Credit Badge */}
              <div
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:bg-background/80 hover:text-foreground",
                  focusRing
                )}
              >
                <span>Engineered by</span>
                <Image
                  src="/Stryvenix-Transparent-Logo.png"
                  alt="Stryvenix"
                  width={90}
                  height={20}
                  className="h-3.5 w-auto opacity-75 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105"
                />
              </div>
            </div>

            {/* Slogan Tag & Instagram Direct Badge */}
            <div className="flex items-center gap-3">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground transition-all duration-300 hover:border-primary/50 hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/20",
                  focusRing
                )}
                title="Follow ATP Fitness on Instagram"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>

              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary">
                <Sparkles className="h-3 w-3" />
                <span>Train Different.</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </footer>
  );
}