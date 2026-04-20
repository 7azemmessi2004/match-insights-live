// AI video auto-scan — samples frames from a cloud-stored MP4 and asks Gemini Vision
// to detect events (shots, goals, fouls, key moments).
//
// Strategy:
// 1. Get signed URL from match.video_url (already stored).
// 2. Use the @ffmpeg-free approach: we ask the AI to ingest the full video URL via
//    Gemini's native video understanding (Lovable AI Gateway supports it on
//    google/gemini-2.5-pro and gemini-3-pro). This avoids running ffmpeg in Deno.
// 3. Parse structured response (timestamps + event types + descriptions).
// 4. Insert as bookmarks (named clip markers) AND insights for narrative.
//
// Note: Gemini accepts video via inline base64 OR a fetched URL passed inline.
// For large MP4s we pass the URL as `image_url` style payload — the gateway
// supports this for video_url parts when the model is video-capable.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectedEvent {
  timestamp_sec: number;
  event_type: "shot" | "goal" | "save" | "foul" | "card" | "corner" | "free_kick" | "key_pass" | "tackle" | "highlight";
  team: "home" | "away" | "unknown";
  description: string;
  confidence: number;
}

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

    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("*,home_team:teams!matches_home_team_id_fkey(*),away_team:teams!matches_away_team_id_fkey(*)")
      .eq("id", matchId).single();
    if (matchErr || !match) throw new Error("Match not found");
    if (!match.video_url || match.video_storage !== "cloud") {
      throw new Error("Match has no cloud-uploaded video. Upload first.");
    }

    const homeName = match.home_team?.short_name ?? "HOME";
    const awayName = match.away_team?.short_name ?? "AWAY";

    // Call Lovable AI Gateway with the video URL inline.
    // Gemini supports `video_url` content parts.
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You are an elite football match analyst with frame-perfect video vision. " +
              "You watch a match video and identify every meaningful event with its timestamp in seconds from the start. " +
              `Home team is "${homeName}" (usually attacking left-to-right initially). Away team is "${awayName}". ` +
              "Be precise about timestamps. Be concise about descriptions. Only return events you are reasonably sure about.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analyse this football match video. Identify shots, goals, saves, fouls, cards, corners, free-kicks, key passes, and notable defensive actions. " +
                  "Return them as structured events with timestamps. Aim for 15-40 events for a full match. " +
                  "Also return a 2-3 sentence overall match summary.",
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
              name: "emit_video_analysis",
              description: "Emit detected events and a summary",
              parameters: {
                type: "object",
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp_sec: { type: "number" },
                        event_type: {
                          type: "string",
                          enum: ["shot", "goal", "save", "foul", "card", "corner", "free_kick", "key_pass", "tackle", "highlight"],
                        },
                        team: { type: "string", enum: ["home", "away", "unknown"] },
                        description: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["timestamp_sec", "event_type", "team", "description", "confidence"],
                    },
                  },
                  summary: { type: "string" },
                },
                required: ["events", "summary"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_video_analysis" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited — try again in a minute" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Add credits to your Lovable AI workspace" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      throw new Error(`AI gateway returned ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed: { events: DetectedEvent[]; summary: string } = args
      ? JSON.parse(args)
      : { events: [], summary: "" };

    // Persist as bookmarks
    if (parsed.events.length > 0) {
      const colorMap: Record<string, string> = {
        goal: "#facc15", shot: "#f87171", save: "#60a5fa",
        foul: "#fb923c", card: "#ef4444", corner: "#a78bfa",
        free_kick: "#a78bfa", key_pass: "#34d399", tackle: "#94a3b8", highlight: "#22d3ee",
      };
      const rows = parsed.events.map((e) => ({
        match_id: matchId,
        label: `${e.event_type.replace("_", " ")} (${e.team}) — ${e.description}`.slice(0, 200),
        start_sec: Math.max(0, e.timestamp_sec - 3),
        end_sec: e.timestamp_sec + 3,
        color: colorMap[e.event_type] ?? "#22d3ee",
      }));
      await supabase.from("bookmarks").insert(rows);
    }

    // Persist summary as an insight
    if (parsed.summary) {
      await supabase.from("insights").insert({
        match_id: matchId,
        kind: "summary",
        title: "AI Video Analysis",
        body: parsed.summary,
        severity: "info",
        metadata: { source: "video-analyze", events_detected: parsed.events.length },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, events: parsed.events.length, summary: parsed.summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("video-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
