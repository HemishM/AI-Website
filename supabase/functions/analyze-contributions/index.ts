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

Document content (excerpt):
"""
${(member.additions || '').slice(0, 2000)}
"""

${member.name} made ${member.revision_count || 0} out of ${members.reduce((a: number, m: any) => a + (m.revision_count || 0), 0)} total edits (${member.revision_share || 0}% of saves).

Based on their share of edits and the document content, evaluate their contribution.

You MUST respond with ONLY a raw JSON object, no markdown, no code blocks. Example:
{"score": 75, "summary": "Active contributor who worked on market analysis and revenue model sections."}

Fields:
- score: integer 0-100 (weight both edit share and document relevance to assignment)
- summary: one sentence describing their contribution`;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-website-seven-phi.vercel.app",
        },
        body: JSON.stringify({
          model: "google/gemma-3-4b-it:free",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";

      let parsed = {};
      if (raw) {
        // Try direct parse first
        try { parsed = JSON.parse(raw.trim()); } catch {
          // Strip markdown code blocks
          const stripped = raw.replace(/```json|```/g, '').trim();
          try { parsed = JSON.parse(stripped); } catch {
            // Extract JSON object using regex
            const match = raw.match(/\{[\s\S]*"score"[\s\S]*"summary"[\s\S]*\}/);
            if (match) {
              try { parsed = JSON.parse(match[0]); } catch {}
            }
          }
        }
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
