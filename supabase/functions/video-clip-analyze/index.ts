// AI clip analysis — analyses a short window of a cloud-stored video
// to suggest event type, players involved, tactical context.
// Returns an event payload the client can insert (after user confirms).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { matchId, startSec, endSec } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (typeof startSec !== "number" || typeof endSec !== "number") {
      throw new Error("startSec and endSec required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id,video_url,video_storage,home_team_id,away_team_id,home_team:teams!matches_home_team_id_fkey(short_name),away_team:teams!matches_away_team_id_fkey(short_name)")
      .eq("id", matchId).single();
    if (matchErr || !match) throw new Error("Match not found");
    if (!match.video_url || match.video_storage !== "cloud") {
      throw new Error("Cloud-uploaded video required");
    }

    const homeName = (match.home_team as { short_name?: string })?.short_name ?? "HOME";
    const awayName = (match.away_team as { short_name?: string })?.short_name ?? "AWAY";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              `You analyse a single football play. Home: "${homeName}" (left-to-right). Away: "${awayName}". ` +
              "Return ONE most-significant event in the clip with type, team, pitch coords (0-100 each axis), and a 1-sentence tactical note.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyse only the segment from ${startSec.toFixed(1)}s to ${endSec.toFixed(1)}s of this video. Return the most significant event with pitch coordinates.`,
              },
              {
                type: "video_url",
                video_url: { url: match.video_url },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_clip_event",
              description: "Emit one detected event in the clip",
              parameters: {
                type: "object",
                properties: {
                  event_type: {
                    type: "string",
                    enum: ["pass", "shot", "cross", "carry", "tackle", "interception", "foul", "save", "header", "duel"],
                  },
                  team: { type: "string", enum: ["home", "away"] },
                  outcome: { type: "string" },
                  x: { type: "number", description: "Start x 0-100" },
                  y: { type: "number", description: "Start y 0-100" },
                  end_x: { type: "number" },
                  end_y: { type: "number" },
                  timestamp_sec: { type: "number" },
                  note: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["event_type", "team", "x", "y", "timestamp_sec", "note", "confidence"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_clip_event" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Add credits to your Lovable AI workspace" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      throw new Error(`AI gateway returned ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({ ok: true, event: null, message: "No clear event detected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = JSON.parse(args);

    return new Response(
      JSON.stringify({ ok: true, event: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("video-clip-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
