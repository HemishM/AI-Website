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

    const memberList = activeMembers.map((m: any, i: number) => {
      const textPreview = m.additions && m.additions.trim().length > 0
        ? `\n  Text they added:\n  """\n  ${m.additions.slice(0, 800)}\n  """`
        : '\n  (no specific text extracted)';
      return `Member${i+1} (${m.name}): ${m.revision_count} edits (${m.revision_share}% of saves)${textPreview}`;
    }).join('\n\n');

    const prompt = `You are evaluating student contributions to a group assignment.

Assignment: ${assignment}

Here is what each student actually added to the document:

${memberList}

Scoring rules (apply strictly):
1. Read each person's added text carefully
2. Count only sentences that are DIRECTLY relevant to the assignment
3. If someone added mostly personal stories, hobbies, or off-topic content, their score must be much lower than their edit share — even if they made many edits
4. Someone who made 20% of edits but added 0% relevant content should score 0-5%
5. Scores must sum to exactly 100

You MUST respond with ONLY a raw JSON array, no markdown, no code blocks. Use "Member1", "Member2" etc.

Example where Member2 added off-topic content:
[{"member":"Member1","score":90,"summary":"Added detailed market analysis and revenue model directly relevant to the assignment."},{"member":"Member2","score":10,"summary":"Added mostly off-topic personal content with only one relevant sentence about pricing strategy."}]

- summary must describe WHAT they actually wrote and HOW relevant it is`;

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
