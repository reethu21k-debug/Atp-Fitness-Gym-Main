"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth.actions";
import type { AppRole } from "@/types/database";

/* ---------------------------------------------------------------------- */
/*  Config                                                                */
/* ---------------------------------------------------------------------- */

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/gallery", label: "Gallery" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  gym_owner: "Owner",
  receptionist: "Receptionist",
  trainer: "Trainer",
  member: "Client",
};

export interface SiteHeaderAuthUser {
  fullName: string;
  role: AppRole;
  avatarUrl?: string | null;
}

/** Desktop breakpoint = Tailwind `lg` (1024px). Below it the hamburger menu is used. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * The header switches to its compact state past SCROLL_ON and back below SCROLL_OFF.
 * Two different thresholds (instead of one) stop it flickering when the scroll
 * position hovers around a single pixel value.
 */
const SCROLL_ON = 24;
const SCROLL_OFF = 8;

/* ---------------------------------------------------------------------- */
/*  Shared styles                                                         */
/* ---------------------------------------------------------------------- */

/** The light sweep that slides across the orange "Book trial" buttons on hover */
const SWEEP =
  "pointer-events-none absolute inset-y-0 left-0 w-1/2 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-[300%] motion-reduce:hidden";

/** Outlined glass buttons in the mobile sheet. Text colour is pinned on hover so it never fades out. */
const MOBILE_OUTLINE =
  "h-12 rounded-full border-border/60 bg-background/50 font-eyebrow text-sm font-semibold uppercase tracking-widest text-foreground backdrop-blur-md transition-all hover:border-primary hover:bg-primary/5 hover:text-primary";

/** Glass card surface used by the mobile nav rows and the mobile user card */
const MOBILE_GLASS = "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-md";

/* ---------------------------------------------------------------------- */
/*  Small helpers                                                         */
/* ---------------------------------------------------------------------- */

const roleLabel = (role: AppRole) => ROLE_LABEL[role] ?? "Member";
const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function UserAvatar({ user, className }: { user: SiteHeaderAuthUser; className: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
      <AvatarFallback>{initialOf(user.fullName)}</AvatarFallback>
    </Avatar>
  );
}

function BookTrialButton({
  variant,
  onClick,
}: {
  variant: "desktop" | "mobile";
  onClick?: () => void;
}) {
  const mobile = variant === "mobile";
  return (
    <Button
      asChild
      className={
        mobile
          ? "group relative h-12 overflow-hidden rounded-full bg-primary font-eyebrow text-sm font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:text-primary-foreground"
          : "group relative h-10 overflow-hidden rounded-full bg-primary px-6 font-eyebrow text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-[0_4px_14px_0_rgba(255,106,0,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:text-primary-foreground hover:shadow-[0_8px_24px_rgba(255,106,0,0.35)]"
      }
    >
      <Link href="/contact" onClick={onClick}>
        <span className="relative z-10 flex items-center gap-2">
          {mobile ? "Book a Free Trial" : "Book Trial"}
          <ArrowRight
            className={`${mobile ? "h-4 w-4" : "h-3.5 w-3.5"} transition-transform duration-300 group-hover:translate-x-1`}
          />
        </span>
        {/* Light sweep on hover */}
        <span aria-hidden className={SWEEP} />
      </Link>
    </Button>
  );
}

/* ---------------------------------------------------------------------- */
/*  Header                                                                */
/* ---------------------------------------------------------------------- */

export function SiteHeader({ user }: { user?: SiteHeaderAuthUser | null }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Scroll state + reading-progress line (progress is written straight to the DOM, no re-renders)
  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > SCROLL_OFF : y > SCROLL_ON));

      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(Math.max(y / max, 0), 1) : 0;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${progress})`;
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // Page height changes without any scrolling (images load, route changes) —
    // keep the progress line honest in those cases too.
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    observer?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Mobile menu: lock body scroll, move focus in, close on Escape (and hand focus back),
  // close when resized up to desktop
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Keyboard users land on the first link instead of being left on the page behind the sheet
    mobileNavRef.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    mq.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      mq.removeEventListener("change", onChange);
    };
  }, [open]);

  // Close the menu whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/*
        NOTE: the header itself has NO backdrop-filter. A backdrop-filter on an ancestor turns it into the
        containing block for `position: fixed` children, which used to squash the mobile overlay into the
        header box once you scrolled. Only the capsule below is blurred; the overlay is a sibling.
      */}
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 px-3 transition-[padding] duration-500 ease-out motion-reduce:transition-none sm:px-5 ${
          scrolled ? "pt-2 sm:pt-3" : "pt-3 sm:pt-5"
        }`}
      >
        {/* Floating glass capsule */}
        <div
          className={`pointer-events-auto relative mx-auto w-full max-w-7xl overflow-hidden rounded-full border border-border/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-500 ease-out motion-reduce:transition-none ${
            scrolled
              ? "bg-background/85 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.30),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              : "bg-background/70 shadow-[0_12px_40px_-14px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.45)]"
          }`}
        >
          {/* Glass sheen + specular top edge */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/30 via-white/5 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
          />

          <div
            className={`relative flex items-center justify-between gap-3 pl-4 pr-2 transition-[height] duration-500 ease-out motion-reduce:transition-none sm:pl-6 sm:pr-3 lg:grid lg:grid-cols-[1fr_auto_1fr] ${
              scrolled ? "h-14" : "h-16"
            }`}
          >
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center justify-self-start rounded-xl bg-[#FFFAF6]/95 px-2.5 py-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_4px_14px_-4px_rgba(0,0,0,0.4)] transition-transform duration-500 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="ATP Fitness home"
            >
              {/* The logo artwork is dark, so it sits on a light chip to stay visible on the glass */}
              <Image
                src="/logo.png"
                alt="ATP Fitness"
                width={1350}
                height={901}
                priority
                className="h-8 w-auto object-contain sm:h-9"
              />
            </Link>

            {/* Desktop navigation */}
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 rounded-full border border-border/40 bg-foreground/[0.04] p-1 lg:flex"
            >
              {NAV_LINKS.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative rounded-full px-4 py-2 font-eyebrow text-xs font-semibold uppercase tracking-widest transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:px-5 ${
                      active
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-foreground/70 hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    <span className="relative z-10">{link.label}</span>
                    <span
                      aria-hidden
                      className={`absolute bottom-1 left-1/2 h-[3px] -translate-x-1/2 rounded-full bg-primary transition-all duration-300 ${
                        active ? "w-3 opacity-100" : "w-0 opacity-0 group-hover:w-3 group-hover:opacity-100"
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>

            {/* Desktop actions */}
            <div className="hidden items-center gap-2 justify-self-end lg:flex">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Account menu for ${user.fullName}`}
                    className="flex items-center gap-2 rounded-full border border-border/50 bg-background/60 py-1 pl-1 pr-3 transition-colors hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserAvatar user={user} className="h-8 w-8 ring-2 ring-primary/40" />
                    <span className="hidden max-w-[160px] truncate font-eyebrow text-xs font-semibold uppercase tracking-wide text-foreground xl:inline">
                      {roleLabel(user.role)} {firstNameOf(user.fullName)}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-foreground/60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={12}
                    className="w-60 rounded-2xl border-border/50 bg-background/80 p-1.5 shadow-2xl backdrop-blur-2xl backdrop-saturate-150"
                  >
                    <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2">
                      <UserAvatar user={user} className="h-9 w-9 ring-2 ring-primary/30" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                        <p className="text-xs font-normal text-muted-foreground">{roleLabel(user.role)}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {/* Focus colours are set explicitly so the row never washes out on hover */}
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer rounded-xl focus:bg-primary/10 focus:text-foreground"
                    >
                      <Link href="/dashboard">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <form action={signOut}>
                      <DropdownMenuItem
                        asChild
                        className="cursor-pointer rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <button type="submit" className="w-full">
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </DropdownMenuItem>
                    </form>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-full px-4 py-2 font-eyebrow text-xs font-semibold uppercase tracking-wide text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Sign In
                  </Link>
                  <BookTrialButton variant="desktop" />
                </>
              )}
            </div>

            {/* Mobile / tablet toggle (animated hamburger) */}
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/60 text-foreground transition-all hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 lg:hidden"
            >
              <span className="relative block h-3.5 w-5">
                <span
                  className={`absolute left-0 h-[2px] w-5 rounded-full bg-foreground transition-all duration-300 motion-reduce:transition-none ${
                    open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0 translate-y-0 rotate-0"
                  }`}
                />
                <span
                  className={`absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-foreground transition-all duration-300 motion-reduce:transition-none ${
                    open ? "w-0 opacity-0" : "w-3.5 opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 h-[2px] w-5 rounded-full bg-foreground transition-all duration-300 motion-reduce:transition-none ${
                    open ? "top-1/2 -translate-y-1/2 -rotate-45" : "top-full -translate-y-full rotate-0"
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Reading progress */}
          <span
            ref={progressRef}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-full origin-left bg-primary/80 will-change-transform"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
      </header>

      {/* Mobile / tablet menu — frosted full-screen sheet (sibling of the header on purpose) */}
      <div
        id="mobile-menu"
        aria-hidden={!open}
        className={`fixed inset-0 z-40 transition-[opacity,visibility] duration-500 motion-reduce:transition-none lg:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        {/* Frosted backdrop (click to close) */}
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-2xl backdrop-saturate-150"
          onClick={() => setOpen(false)}
        />

        {/* Soft brand-orange light behind the glass */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        <div className="relative h-full overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-8 px-5 pb-10 pt-28 sm:px-8">
            <nav ref={mobileNavRef} aria-label="Mobile" className="flex flex-col gap-3">
              {NAV_LINKS.map((link, i) => {
                const active = isActive(link.href);
                return (
                  // Stagger lives on the wrapper so hover states on the link never inherit the delay
                  <div
                    key={link.href}
                    className={`transition-[transform,opacity] duration-500 motion-reduce:transition-none ${
                      open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                    }`}
                    style={{ transitionDelay: open ? `${80 + i * 60}ms` : "0ms" }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center justify-between rounded-2xl border px-5 py-4 font-eyebrow text-lg font-semibold uppercase tracking-widest transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOBILE_GLASS} ${
                        active
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/40 bg-background/50 text-foreground/80 hover:border-primary/40 hover:bg-background/70 hover:text-foreground"
                      }`}
                    >
                      {link.label}
                      <ChevronRight
                        className={`h-5 w-5 text-primary transition-all duration-300 ${
                          active ? "opacity-100" : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                        }`}
                      />
                    </Link>
                  </div>
                );
              })}
            </nav>

            {/* Mobile actions */}
            <div
              className={`flex flex-col gap-3 transition-[transform,opacity] duration-500 motion-reduce:transition-none ${
                open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
              style={{ transitionDelay: open ? `${80 + NAV_LINKS.length * 60}ms` : "0ms" }}
            >
              {user ? (
                <>
                  <div className={`flex items-center gap-3 rounded-2xl border border-border/40 bg-background/50 p-3 ${MOBILE_GLASS}`}>
                    <UserAvatar user={user} className="h-11 w-11 ring-2 ring-primary/40" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
                    </div>
                  </div>
                  <Button variant="outline" className={MOBILE_OUTLINE} asChild>
                    <Link href="/dashboard" onClick={() => setOpen(false)}>
                      Dashboard
                    </Link>
                  </Button>
                  <form action={signOut}>
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-12 w-full rounded-full border-destructive/40 bg-background/50 font-eyebrow text-sm font-semibold uppercase tracking-widest text-destructive backdrop-blur-md transition-all hover:bg-destructive/5 hover:text-destructive"
                    >
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Button variant="outline" className={MOBILE_OUTLINE} asChild>
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                  <BookTrialButton variant="mobile" onClick={() => setOpen(false)} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}