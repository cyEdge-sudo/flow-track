import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Exclude Next static assets and files
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
