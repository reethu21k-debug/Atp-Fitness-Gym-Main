import { Bebas_Neue, Oswald, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";
import { getCurrentProfile } from "@/lib/utils/permissions";

/*
  Gym-vibe type system, loaded once here so every page under /marketing can use it:
    .font-display    -> Bebas Neue     (tall condensed headlines)
    .font-eyebrow    -> Oswald         (condensed labels, tags, nav)
    .font-mono-score -> JetBrains Mono (scoreboard digits, stats, data)
  Body copy stays on the default font-sans for readability.

  Loaded with next/font instead of a CSS @import: fonts are self-hosted, preloaded
  and don't block rendering, so there's no flash of unstyled text on first paint.
*/
const display = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const eyebrow = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-eyebrow",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-mono-score",
  display: "swap",
});

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Reuses the existing auth/session mechanism (same getCurrentProfile() the
  // dashboard layout uses) so the header reflects the real signed-in user
  // instead of a hardcoded "Sign In" link. Re-evaluated on every navigation
  // since this is a server component, so login/logout/refresh all stay correct.
  const profile = await getCurrentProfile();

  return (
    <div
      className={`${display.variable} ${eyebrow.variable} ${mono.variable} flex min-h-screen flex-col overflow-x-clip bg-background font-sans text-foreground antialiased selection:bg-primary/30`}
    >
      <style>{`
        .font-display { font-family: var(--font-display), 'Bebas Neue', sans-serif; letter-spacing: 0.02em; }
        .font-eyebrow { font-family: var(--font-eyebrow), 'Oswald', sans-serif; letter-spacing: 0.08em; }
        .font-mono-score { font-family: var(--font-mono-score), 'JetBrains Mono', monospace; }
      `}</style>

      {/* Keyboard users can jump past the floating header */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteHeader
        user={
          profile
            ? { fullName: profile.full_name, role: profile.role, avatarUrl: profile.avatar_url }
            : null
        }
      />

      {/*
        Pages clear the floating header themselves (pt-32 on mobile, sm:pt-40 from
        tablet up) and draw their own glass background, so <main> adds no padding.
      */}
      <main id="main" className="flex-1 outline-none">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}