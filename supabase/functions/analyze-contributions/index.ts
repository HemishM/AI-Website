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

    // Zero out members with no edits immediately
    const activeMembers = members.filter((m: any) => m.revision_count > 0);
    const inactiveMembers = members.filter((m: any) => !m.revision_count || m.revision_count === 0);

    const results: any[] = inactiveMembers.map((m: any) => ({
      email: m.email,
      name: m.name,
      score: 0,
      summary: "No edits made to the document.",
    }));

    if (activeMembers.length === 0) {
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalRevisions = activeMembers.reduce((a: number, m: any) => a + (m.revision_count || 0), 0);

    const memberList = activeMembers.map((m: any, i: number) =>
      `- Member${i+1} (${m.name}): ${m.revision_count} edits (${m.revision_share}% of saves)`
    ).join('\n');

    const docExcerpt = (activeMembers[0]?.additions || '').slice(0, 2500);

    const prompt = `You are evaluating student contributions to a group assignment.

Assignment: ${assignment}

Edit counts per student:
${memberList}

Document content (excerpt):
"""
${docExcerpt}
"""

Distribute exactly 100 percentage points among the active contributors based on:
1. Their share of edits (primary factor)
2. How relevant the document content is to the assignment (secondary factor)
3. Students who only added off-topic content should score lower than their edit share suggests

You MUST respond with ONLY a raw JSON array, no markdown, no code blocks. Use the exact member index numbers (Member1, Member2, etc.) in the "member" field.

Example for 2 students:
[{"member":"Member1","score":70,"summary":"Led market analysis and revenue model sections."},{"member":"Member2","score":30,"summary":"Added introduction and bibliography."}]

Rules:
- Scores must sum to exactly 100
- Use "Member1", "Member2" etc matching the list above
- summary is one sentence per person`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-website-seven-phi.vercel.app",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-nano-30b-a3b:free",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "[]";

    let parsed: any[] = [];
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      const j = JSON.parse(cleaned);
      // Handle both array and {results: [...]} formats
      parsed = Array.isArray(j) ? j : (j.results || j.contributors || Object.values(j));
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) try { parsed = JSON.parse(match[0]); } catch {}
    }

    // If AI failed, fall back to revision share
    if (!Array.isArray(parsed) || parsed.length === 0) {
      for (const m of activeMembers) {
        results.push({
          email: m.email,
          name: m.name,
          score: m.revision_share || 0,
          summary: `Made ${m.revision_count} edits (${m.revision_share}% of total saves).`,
        });
      }
    } else {
      for (let i = 0; i < activeMembers.length; i++) {
        const m = activeMembers[i];
        const key = `Member${i+1}`;
        const aiResult = parsed.find((r: any) => r.member === key);
        results.push({
          email: m.email,
          name: m.name,
          score: aiResult?.score ?? m.revision_share ?? 0,
          summary: aiResult?.summary || `Made ${m.revision_count} edits (${m.revision_share}% of total saves).`,
        });
      }
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
