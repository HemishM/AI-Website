import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { members, assignment } = await req.json();
    // members: [{ name, email, additions }]
    // assignment: string describing the task

    const results = [];

    for (const member of members) {
      if (!member.additions || member.additions.trim().length === 0) {
        results.push({
          email: member.email,
          name: member.name,
          score: 0,
          summary: "No contributions detected in the document.",
          word_count: 0,
        });
        continue;
      }

      const wordCount = member.additions.trim().split(/\s+/).length;

      const prompt = `You are evaluating a student's contribution to a group assignment.

Assignment: ${assignment}

${member.name}'s text additions to the document:
"""
${member.additions.slice(0, 3000)}
"""

Evaluate this contribution. You MUST respond with ONLY a raw JSON object, no markdown, no code blocks, no explanation. Example format:
{"score": 75, "summary": "Strong contributions to market analysis section, highly relevant to the assignment."}

Fields:
- score: integer 0-100 for relevance and substance
- summary: one sentence max`;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-website-seven-phi.vercel.app",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "{}";

      // Strip markdown code blocks if present
      const cleaned = raw.replace(/```json|```/g, '').trim();

      let parsed = {};
      try { parsed = JSON.parse(cleaned); } catch {
        console.error("JSON parse failed for", member.email, "raw:", raw);
      }

      results.push({
        email: member.email,
        name: member.name,
        score: parsed.score || 0,
        summary: parsed.summary || "Could not analyze contribution.",
        word_count: wordCount,
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
