// Staff approves/denies a pending account change request. If approved, applies it via admin API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPassword } from "../_shared/pwCrypto.ts";

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

    const { data: userData } = await supaUser.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(url, service);

    // Staff check
    const { data: staff } = await admin.from("user_roles")
      .select("role").eq("user_id", userData.user.id)
      .in("role", ["owner", "admin", "moderator"]).maybeSingle();
    if (!staff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { request_id, action, note } = await req.json();
    if (!request_id || !["approve", "deny"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: reqRow, error: reqErr } = await admin.from("account_change_requests")
      .select("*").eq("id", request_id).maybeSingle();
    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (reqRow.status !== "pending") {
      return new Response(JSON.stringify({ error: "Already reviewed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let applyErr: string | null = null;
    if (action === "approve") {
      if (reqRow.request_type === "password") {
        try {
          const plaintext = await decryptPassword(reqRow.new_password_ciphertext);
          const { error } = await admin.auth.admin.updateUserById(reqRow.user_id, { password: plaintext });
          if (error) applyErr = error.message;
        } catch (e: any) {
          applyErr = "Could not decrypt request payload";
        }
      } else if (reqRow.request_type === "username") {
        const { error } = await admin.from("profiles").update({ username: reqRow.new_username }).eq("id", reqRow.user_id);
        if (error) applyErr = error.message;
      }
    }

    if (applyErr) {
      return new Response(JSON.stringify({ error: "Could not apply: " + applyErr }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update request row (clear sensitive fields)
    await admin.from("account_change_requests").update({
      status: action === "approve" ? "approved" : "denied",
      reviewed_by: userData.user.id,
      reviewed_at: new Date().toISOString(),
      note: note ?? null,
      new_password_ciphertext: null,
    }).eq("id", request_id);

    // Notify user
    const notifType = action === "approve"
      ? (reqRow.request_type === "password" ? "password_changed" : "username_changed")
      : "request_denied";
    await admin.from("notifications").insert({
      user_id: reqRow.user_id,
      actor_id: userData.user.id,
      type: notifType,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
