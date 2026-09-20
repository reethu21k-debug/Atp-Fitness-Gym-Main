import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";
import { getCurrentProfile } from "@/lib/utils/permissions";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Reuses the existing auth/session mechanism (same getCurrentProfile() the
  // dashboard layout uses) so the header reflects the real signed-in user
  // instead of a hardcoded "Sign In" link. Re-evaluated on every navigation
  // since this is a server component, so login/logout/refresh all stay correct.
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1A1A1A] font-sans antialiased">
      {/*
        Gym-vibe type system, loaded once here so every page under /marketing
        can use it:
          .font-display    -> Bebas Neue     (tall, refined condensed headlines — premium stadium signage, not a blocky poster font)
          .font-eyebrow    -> Oswald         (condensed labels, tags, nav)
          .font-mono-score -> JetBrains Mono (scoreboard digits, stats, data)
        Body copy stays on the default font-sans (e.g. Inter) for readability.
      */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.02em; }
        .font-eyebrow { font-family: 'Oswald', sans-serif; letter-spacing: 0.08em; }
        .font-mono-score { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <SiteHeader
        user={
          profile
            ? { fullName: profile.full_name, role: profile.role, avatarUrl: profile.avatar_url }
            : null
        }
      />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}