import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // NOTE: `api/test-whatsapp` used to be excluded here, which made an
    // unauthenticated message-sending endpoint publicly reachable. That route
    // now authenticates with CRON_SECRET itself, so no exclusion is needed.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
