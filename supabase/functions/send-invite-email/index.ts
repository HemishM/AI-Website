import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invited_email, project_name, invited_by_name } = await req.json();

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "CollabrAI", email: "hemmy0629@gmail.com" },
        to: [{ email: invited_email }],
        subject: `You've been invited to a project on CollabrAI`,
        htmlContent: `
          <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; background: #080d1a; color: #f1f5f9;">
            <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 12px; color: #ffffff;">You've been invited!</h1>
            <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
              <strong style="color:#f1f5f9;">${invited_by_name || "A teammate"}</strong> has invited you to collaborate on
              <strong style="color:#f1f5f9;">${project_name || "a project"}</strong> using CollabrAI —
              the AI-powered group project accountability tracker.
            </p>
            <a href="https://ai-website-seven-phi.vercel.app/login.html"
               style="display:inline-block; background: linear-gradient(135deg,#3b82f6,#8b5cf6); color:white; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; text-decoration: none;">
              Accept Invite &amp; Sign Up
            </a>
            <p style="color: #475569; font-size: 12px; margin-top: 32px;">
              CollabrAI tracks group project contributions automatically so everyone gets credit for the work they actually do.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
