import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "node:crypto";

function verifyToken(id: string, token: string): boolean {
  const secret = process.env.ACK_SECRET || "dev-ack-secret";
  const expected = crypto.createHmac("sha256", secret).update(id).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const id = search.get("i");
  const token = search.get("t");

  if (!id || !token || !verifyToken(id, token)) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:Arial;padding:24px;"><h2>Invalid or expired link</h2><p>Please open the latest nudge email and try again.</p></body></html>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const supabase = createAdminClient();

  await supabase
    .from("nudges")
    .update({ acknowledged_at: new Date().toISOString(), status: "acknowledged" })
    .eq("id", id);

  return new NextResponse(
    `<!doctype html>
    <html>
      <body style="font-family:Arial;padding:24px;">
        <h2>Thanks!</h2>
        <p>Your task check-in has been recorded.</p>
        <p>You can now close this tab.</p>
      </body>
    </html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
