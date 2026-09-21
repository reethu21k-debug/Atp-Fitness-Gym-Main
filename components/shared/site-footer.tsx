import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
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

const DIRECTIONS_URL =
  "https://www.google.com/maps/dir//ATP+Fitness,+r+Lodge,+TCR+Towers,+15%2F704,+Main+Rd,+opp.+jonna+iron+mart,+Kamalanagar,+Anantapur,+Andhra+Pradesh+515001/@17.4751744,78.413824,12z/data=!4m8!4m7!1m0!1m5!1m1!1s0x3bb14b00001c2a63:0x8f972d79a7f55ba6!2m2!1d77.6029104!2d14.6809501?entry=ttu&g_ep=EgoyMDI2MDkxNi4wIKXMDSoASAFQAw%3D%3D";

// Shared glass surface — same recipe as Pricing / Gallery / About / Blog
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Visible keyboard focus for every footer link
const focusRing =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-background px-4 pb-6 pt-16 selection:bg-primary/30 sm:px-6 sm:pb-8 sm:pt-24">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -left-16 top-0 h-64 w-64 rounded-full bg-primary/10 blur-[100px] sm:left-0 sm:h-80 sm:w-80 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-80 sm:w-80 sm:blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className={cn("rounded-[2rem] p-6 sm:p-10 lg:p-12", glass)}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))] lg:gap-x-8">
            {/* --- Brand + contact --- */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <Link href="/" className={cn("inline-flex items-center", focusRing)}>
                <Image
                  src="/logo.png"
                  alt="ATP Fitness"
                  width={1350}
                  height={901}
                  className="h-12 w-auto sm:h-14"
                />
              </Link>

              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Strength training, group classes, and personal coaching — open
                every day.
              </p>

              <address className="mt-5 space-y-3 text-sm not-italic">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 p-2">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <span className="min-w-0 text-muted-foreground">
                    TCR Towers, 15/704, Main Rd, near Mayur Lodge, Kamalanagar,
                    Anantapur, Andhra Pradesh 515001
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 rounded-full bg-primary/10 p-2">
                    <Clock className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">Open daily</span>{" "}
                    5 AM – 11 PM
                  </span>
                </div>
              </address>

              <a
                href={DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline",
                  focusRing
                )}
              >
                Get directions
                <ArrowUpRight
                  className="h-4 w-4 transition-transform duration-300 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                  aria-hidden
                />
              </a>
            </div>

            {/* --- Link columns --- */}
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-sm font-semibold text-foreground">
                  {col.title}
                </h2>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className={cn(
                          "text-sm text-muted-foreground transition-colors hover:text-primary hover:underline",
                          focusRing
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* --- Bottom bar --- */}
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-6 text-center sm:flex-row sm:text-left">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ATP Fitness. All rights reserved.
            </p>
            <p className="text-sm font-semibold text-primary">Train Different.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}