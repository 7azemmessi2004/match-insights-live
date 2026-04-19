// AI insights edge function — calls Lovable AI Gateway
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { matchId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch match + events
    const [{ data: match }, { data: events }] = await Promise.all([
      supabase.from("matches").select("*,home_team:teams!matches_home_team_id_fkey(*),away_team:teams!matches_away_team_id_fkey(*)").eq("id", matchId).single(),
      supabase.from("events").select("*").eq("match_id", matchId).order("minute"),
    ]);

    if (!match || !events) throw new Error("Match not found");

    // Build compact summary for the model
    const summary = {
      home: match.home_team?.short_name,
      away: match.away_team?.short_name,
      score: `${match.home_score}-${match.away_score}`,
      total_events: events.length,
      events_by_type: events.reduce((a: Record<string, number>, e) => {
        a[e.event_type] = (a[e.event_type] ?? 0) + 1;
        return a;
      }, {}),
      shots_home: events.filter((e) => e.event_type === "shot" && e.team_id === match.home_team_id).length,
      shots_away: events.filter((e) => e.event_type === "shot" && e.team_id === match.away_team_id).length,
      xg_home: events.filter((e) => e.team_id === match.home_team_id).reduce((s, e) => s + (Number(e.xg) || 0), 0).toFixed(2),
      xg_away: events.filter((e) => e.team_id === match.away_team_id).reduce((s, e) => s + (Number(e.xg) || 0), 0).toFixed(2),
      tags_seen: Array.from(new Set(events.flatMap((e) => e.tags ?? []))).slice(0, 30),
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an elite football tactical analyst. Generate 3-5 sharp, specific tactical observations from match event data. Each insight is ONE short paragraph (2-3 sentences). Focus on patterns, momentum, pressing, dangerous zones, anomalies. No fluff." },
          { role: "user", content: `Match data:\n${JSON.stringify(summary, null, 2)}\n\nReturn JSON.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_insights",
            description: "Emit tactical insights",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      kind: { type: "string", enum: ["summary", "tactical", "alert", "anomaly"] },
                      title: { type: "string" },
                      body: { type: "string" },
                      severity: { type: "string", enum: ["info", "warning", "critical"] },
                    },
                    required: ["kind", "title", "body", "severity"],
                  },
                },
              },
              required: ["insights"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_insights" } },
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Add credits to your Lovable AI workspace" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiResp.ok) throw new Error(`AI gateway: ${aiResp.status}`);

    const aiData = await aiResp.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { insights: [] };

    // Persist insights
    if (parsed.insights?.length) {
      await supabase.from("insights").insert(
        parsed.insights.map((i: { kind: string; title: string; body: string; severity: string }) => ({
          match_id: matchId,
          kind: i.kind, title: i.title, body: i.body, severity: i.severity,
        }))
      );
    }

    return new Response(JSON.stringify({ ok: true, count: parsed.insights?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
