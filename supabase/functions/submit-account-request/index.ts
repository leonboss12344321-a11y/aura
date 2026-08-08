// Verify caller's current password (for password changes) and file a change request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptPassword } from "../_shared/pwCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supaUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });

    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    const body = await req.json();
    const type = String(body.type || "");
    if (!["password", "username"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "password") {
      const current = String(body.current_password || "");
      const next = String(body.new_password || "");
      if (next.length < 8) {
        return new Response(JSON.stringify({ error: "New password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Verify current password by attempting sign-in with fresh client
      const check = createClient(url, anon);
      const { error: signErr } = await check.auth.signInWithPassword({ email: user.email!, password: current });
      if (signErr) {
        return new Response(JSON.stringify({ error: "Current password is incorrect" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      const u = String(body.new_username || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (u.length < 3) {
        return new Response(JSON.stringify({ error: "Username must be 3+ characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      body.new_username = u;
    }

    const admin = createClient(url, service);
    // Cancel any pending request of same type
    await admin.from("account_change_requests")
      .delete()
      .eq("user_id", user.id)
      .eq("request_type", type)
      .eq("status", "pending");

    const encryptedPassword = type === "password"
      ? await encryptPassword(String(body.new_password))
      : null;

    const { error: insErr } = await admin.from("account_change_requests").insert({
      user_id: user.id,
      request_type: type,
      new_username: type === "username" ? body.new_username : null,
      new_password_ciphertext: encryptedPassword,
      status: "pending",
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
