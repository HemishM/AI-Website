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

    const memberList = activeMembers.map((m: any, i: number) => {
      const textPreview = m.additions && m.additions.trim().length > 0
        ? "\n  Text they added:\n  \"\"\"\n  " + m.additions.slice(0, 800) + "\n  \"\"\""
        : "\n  (no specific text extracted)";
      return "Member" + (i+1) + " (" + m.name + "): " + m.revision_count + " edits (" + m.revision_share + "% of saves)" + textPreview;
    }).join("\n\n");

    const prompt = "You are evaluating student contributions to a group assignment.\n\n" +
      "Assignment: " + assignment + "\n\n" +
      "Here is what each student actually added to the document:\n\n" +
      memberList + "\n\n" +
      "Scoring rules (apply strictly):\n" +
      "1. Read each person's added text carefully\n" +
      "2. Count only sentences DIRECTLY relevant to the assignment\n" +
      "3. If someone added mostly personal stories, hobbies, or off-topic content, their score must be much lower than their edit share\n" +
      "4. Someone who added 0% relevant content should score 0-5%\n" +
      "5. Scores must sum to exactly 100\n\n" +
      "Respond with ONLY a raw JSON array. Use Member1, Member2 etc.\n" +
      "Example: [{\"member\":\"Member1\",\"score\":90,\"summary\":\"Strong contribution: added market analysis and revenue model.\"},{\"member\":\"Member2\",\"score\":10,\"summary\":\"Off-topic: added mostly personal stories with one relevant sentence.\"}]\n\n" +
      "Rules:\n" +
      "- Scores sum to 100\n" +
      "- Start summary with Strong contribution:, Partial contribution:, or Off-topic: depending on relevance";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
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

    // Strip markdown fences without using backtick literals
    const fence = String.fromCharCode(96, 96, 96);
    const cleaned = raw.split(fence + "json").join("").split(fence).join("").trim();

    let parsed: any[] = [];
    try {
      const j = JSON.parse(cleaned);
      parsed = Array.isArray(j) ? j : (j.results || j.contributors || Object.values(j));
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch { /* ignore */ } }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      // Fallback to revision share
      for (const m of activeMembers) {
        results.push({
          email: m.email,
          name: m.name,
          score: m.revision_share || 0,
          summary: "Made " + m.revision_count + " edits (" + m.revision_share + "% of total saves).",
        });
      }
    } else {
      const aiScores: any[] = [];
      for (let i = 0; i < activeMembers.length; i++) {
        const m = activeMembers[i];
        const key = "Member" + (i + 1);
        const aiResult = parsed.find((r: any) => r.member === key);
        const aiScore = aiResult?.score ?? m.revision_share ?? 0;
        const summary = (aiResult?.summary || "").toLowerCase();
        const isOffTopic = summary.startsWith("off-topic") || summary.includes("off-topic");
        const finalScore = isOffTopic ? Math.round(m.revision_share * 0.3) : aiScore;
        aiScores.push({ m, finalScore, summary: aiResult?.summary });
      }
      const total = aiScores.reduce((a, s) => a + s.finalScore, 0);
      for (const entry of aiScores) {
        const normalized = total > 0 ? Math.round((entry.finalScore / total) * 100) : entry.m.revision_share;
        results.push({
          email: entry.m.email,
          name: entry.m.name,
          score: normalized,
          summary: entry.summary || "Made " + entry.m.revision_count + " edits (" + entry.m.revision_share + "% of total saves).",
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
