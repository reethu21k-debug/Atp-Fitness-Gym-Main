"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight, ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
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

export function SiteHeader({ user }: { user?: SiteHeaderAuthUser | null }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Add scroll listener for dynamic header styling
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-in-out ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 py-3 shadow-sm"
          : "bg-transparent py-5"
      }`}
    >
      {/* Premium subtle glowing top line */}
      <div className="absolute top-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60" />

      <div className="container mx-auto px-6 md:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/" 
          className="relative z-50 flex items-center transition-transform duration-500 hover:scale-[1.02]"
        >
          <Image
            src="/logo.png"
            alt="ATP Fitness"
            width={1350}
            height={901}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>

        {/* Desktop Navigation - Floating Pill */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 rounded-full border border-border/40 bg-background/50 backdrop-blur-md px-2 py-1.5 shadow-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative px-4 py-2 font-eyebrow text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors duration-300 hover:text-foreground rounded-full hover:bg-muted/50"
            >
              <span className="relative z-10">{link.label}</span>
              {/* Subtle hover dot instead of standard underline */}
              <span className="absolute bottom-1.5 left-1/2 h-[3px] w-0 -translate-x-1/2 rounded-full bg-primary opacity-0 transition-all duration-300 group-hover:w-3 group-hover:opacity-100" />
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-5 md:flex z-50">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 py-1.5 pl-1.5 pr-3 backdrop-blur-md transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
                  <AvatarFallback>{user.fullName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="hidden lg:inline max-w-[160px] truncate font-eyebrow text-xs font-semibold uppercase tracking-wide text-foreground">
                  {ROLE_LABEL[user.role]} {user.fullName.split(" ")[0]}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="truncate font-medium text-foreground">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Link>
                </DropdownMenuItem>
                <form action={signOut}>
                  <DropdownMenuItem asChild className="text-destructive focus:bg-destructive/10 focus:text-destructive">
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
                className="font-eyebrow text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign In
              </Link>
              <Button
                className="group relative overflow-hidden rounded-full bg-primary px-6 font-eyebrow text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-[0_4px_14px_0_rgba(255,106,0,0.2)] transition-all duration-300 hover:shadow-[0_6px_20px_rgba(255,106,0,0.3)] hover:-translate-y-0.5"
                asChild
              >
                <Link href="/contact">
                  <span className="relative z-10 flex items-center gap-2">
                    Book Trial
                    <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                  {/* Button inner shine effect */}
                  <div className="absolute inset-0 z-0 bg-white/20 translate-y-full transition-transform duration-300 group-hover:translate-y-0" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/50 backdrop-blur-sm text-foreground md:hidden transition-transform active:scale-90"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Full-Screen Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-background/95 backdrop-blur-xl transition-all duration-500 ease-[0.22,1,0.36,1] md:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex h-full flex-col justify-center px-8 pb-20 pt-24">
          <nav className="flex flex-col gap-6">
            {NAV_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-6 border-b border-border/40 pb-4 font-eyebrow text-xl font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen(false)}
                style={{
                  transitionDelay: open ? `${i * 60}ms` : "0ms",
                  transform: open ? "translateY(0)" : "translateY(20px)",
                  opacity: open ? 1 : 0,
                  transitionProperty: "all",
                  transitionDuration: "500ms"
                }}
              >
                <span className="font-mono-score text-sm text-primary/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {link.label}
                <ArrowRight className="ml-auto h-5 w-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 text-primary" />
              </Link>
            ))}
          </nav>

          {/* Mobile Actions */}
          <div 
            className="mt-12 flex flex-col gap-4"
            style={{
              transitionDelay: open ? "300ms" : "0ms",
              transform: open ? "translateY(0)" : "translateY(20px)",
              opacity: open ? 1 : 0,
              transitionProperty: "all",
              transitionDuration: "500ms"
            }}
          >
            {user ? (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
                    <AvatarFallback>{user.fullName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-12 rounded-full border-border/60 font-eyebrow text-sm font-semibold uppercase tracking-widest text-foreground hover:border-primary hover:bg-primary/5 hover:text-primary transition-all"
                  asChild
                  onClick={() => setOpen(false)}
                >
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <form action={signOut}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-12 w-full rounded-full border-destructive/40 font-eyebrow text-sm font-semibold uppercase tracking-widest text-destructive hover:bg-destructive/5 transition-all"
                  >
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-12 rounded-full border-border/60 font-eyebrow text-sm font-semibold uppercase tracking-widest text-foreground hover:border-primary hover:bg-primary/5 hover:text-primary transition-all"
                  asChild
                  onClick={() => setOpen(false)}
                >
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button
                  className="h-12 rounded-full bg-primary font-eyebrow text-sm font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                  asChild
                  onClick={() => setOpen(false)}
                >
                  <Link href="/contact">Book a Free Trial</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}