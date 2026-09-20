import type { AppRole } from "@/types/database";

/**
 * getWelcomeMessage(role, fullName) — the personalized post-login greeting
 * used on the dashboard home pages. Always derived from the real
 * authenticated profile's role/full_name — never hardcoded.
 *
 *   gym_owner -> "Welcome, Owner {First}"
 *   trainer   -> "Welcome, Trainer {First}"
 *   member    -> "Welcome, {First}"
 *   others    -> "Welcome, {First}"
 */
export function getWelcomeMessage(role: AppRole, fullName: string): string {
  const firstName = fullName.trim().split(" ")[0] || fullName;
  switch (role) {
    case "gym_owner":
      return `Welcome, Owner ${firstName}`;
    case "trainer":
      return `Welcome, Trainer ${firstName}`;
    case "member":
      return `Welcome, ${firstName}`;
    default:
      return `Welcome, ${firstName}`;
  }
}