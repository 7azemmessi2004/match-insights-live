import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play, Pause, SkipBack, SkipForward, Bookmark as BookmarkIcon,
  Pencil, Trash2, Sparkles, Eraser, Tag as TagIcon, Loader2,
} from "lucide-react";
import { Pitch, yToSvg } from "@/components/pitch/Pitch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface Bookmark {
  id: string;
  label: string;
  start_sec: number;
  end_sec: number | null;
  color: string | null;
}

export interface Annotation {
  id: string;
  timestamp_sec: number;
  shape: "arrow" | "circle" | "rect" | "freehand" | "text";
  data: { points?: Array<{ x: number; y: number }>; x?: number; y?: number; w?: number; h?: number; r?: number };
  color: string | null;
  note: string | null;
}

interface Props {
  videoUrl: string;
  videoStorage: "local" | "cloud";
  bookmarks: Bookmark[];
  annotations: Annotation[];
  allowWrite: boolean;
  onAddBookmark: (b: { label: string; start_sec: number; end_sec: number | null }) => void;
  onDeleteBookmark: (id: string) => void;
  onAddAnnotation: (a: { timestamp_sec: number; shape: Annotation["shape"]; data: Annotation["data"]; color?: string; note?: string }) => void;
  onDeleteAnnotation: (id: string) => void;
  onPitchClick: (videoTimeSec: number) => void; // for click-pitch-while-playing tagging
  onAIAnalyze: () => void;
  onAIClipAnalyze: (startSec: number, endSec: number) => Promise<void>;
  aiAnalyzing: boolean;
}

const TOLERANCE = 1.5; // seconds — annotation visible window

export function VideoPanel({
  videoUrl, videoStorage, bookmarks, annotations, allowWrite,
  onAddBookmark, onDeleteBookmark, onAddAnnotation, onDeleteAnnotation,
  onPitchClick, onAIAnalyze, onAIClipAnalyze, aiAnalyzing,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [drawMode, setDrawMode] = useState<"off" | "arrow" | "circle" | "freehand">("off");
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [bookmarkInLabel, setBookmarkInLabel] = useState("");
  const [bookmarkInStart, setBookmarkInStart] = useState<number | null>(null);
  const [clipAnalyzing, setClipAnalyzing] = useState(false);
  const overlayRef = useRef<SVGSVGElement>(null);

  // Sync state with video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  // J/K/L keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case "j": v.currentTime = Math.max(0, v.currentTime - 5); break;
        case "k": v.paused ? v.play() : v.pause(); break;
        case "l": v.currentTime = Math.min(duration, v.currentTime + 5); break;
        case "arrowleft": v.currentTime = Math.max(0, v.currentTime - 1 / 30); break;
        case "arrowright": v.currentTime = Math.min(duration, v.currentTime + 1 / 30); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [duration]);

  const seek = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, sec));
  }, [duration]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, "0")}`;
  };

  // Visible annotations near currentTime
  const visibleAnnotations = annotations.filter(
    (a) => Math.abs(a.timestamp_sec - currentTime) <= TOLERANCE
  );

  // Drawing on overlay
  const overlayCoord = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } | null => {
    const svg = overlayRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleOverlayDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode === "off" || !allowWrite) return;
    const c = overlayCoord(e);
    if (!c) return;
    if (drawMode === "freehand") {
      setFreehandPoints([c]);
    } else {
      setDrawStart(c);
    }
  };

  const handleOverlayMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode !== "freehand" || freehandPoints.length === 0) return;
    const c = overlayCoord(e);
    if (!c) return;
    setFreehandPoints((p) => [...p, c]);
  };

  const handleOverlayUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode === "off" || !allowWrite) return;
    const end = overlayCoord(e);
    if (!end) return;
    const ts = currentTime;

    if (drawMode === "freehand" && freehandPoints.length > 1) {
      onAddAnnotation({
        timestamp_sec: ts,
        shape: "freehand",
        data: { points: freehandPoints },
      });
      setFreehandPoints([]);
      return;
    }
    if (!drawStart) return;
    if (drawMode === "arrow") {
      onAddAnnotation({
        timestamp_sec: ts,
        shape: "arrow",
        data: { points: [drawStart, end] },
      });
    } else if (drawMode === "circle") {
      const dx = end.x - drawStart.x;
      const dy = end.y - drawStart.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      onAddAnnotation({
        timestamp_sec: ts,
        shape: "circle",
        data: { x: drawStart.x, y: drawStart.y, r },
      });
    }
    setDrawStart(null);
  };

  // Bookmark in/out
  const setIn = () => {
    setBookmarkInStart(currentTime);
    toast.info(`In point: ${fmt(currentTime)}`);
  };
  const setOut = () => {
    if (bookmarkInStart === null) {
      toast.error("Set in point first");
      return;
    }
    if (!bookmarkInLabel.trim()) {
      toast.error("Add a label");
      return;
    }
    onAddBookmark({
      label: bookmarkInLabel.trim(),
      start_sec: bookmarkInStart,
      end_sec: currentTime,
    });
    setBookmarkInStart(null);
    setBookmarkInLabel("");
  };

  const handleClipAnalyze = async () => {
    if (videoStorage !== "cloud") {
      toast.error("Clip analysis requires cloud-uploaded video");
      return;
    }
    const start = Math.max(0, currentTime - 5);
    const end = Math.min(duration, currentTime + 5);
    setClipAnalyzing(true);
    try {
      await onAIClipAnalyze(start, end);
    } finally {
      setClipAnalyzing(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-[1fr_280px] gap-4">
      {/* Left: video + overlay */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="aspect-video w-full"
            controls={false}
            playsInline
            onClick={togglePlay}
          />

          {/* Drawing overlay */}
          <svg
            ref={overlayRef}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            style={{
              cursor: drawMode !== "off" ? "crosshair" : "default",
              pointerEvents: drawMode !== "off" ? "all" : "none",
            }}
            onMouseDown={handleOverlayDown}
            onMouseMove={handleOverlayMove}
            onMouseUp={handleOverlayUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="currentColor" />
              </marker>
            </defs>
            {visibleAnnotations.map((a) => (
              <AnnotationShape key={a.id} a={a} />
            ))}
            {drawMode === "freehand" && freehandPoints.length > 1 && (
              <polyline
                points={freehandPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="#facc15" strokeWidth="0.6"
              />
            )}
          </svg>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => seek(currentTime - 5)} title="Back 5s (J)">
            <SkipBack className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={togglePlay} title="Play/Pause (K)">
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => seek(currentTime + 5)} title="Forward 5s (L)">
            <SkipForward className="size-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {allowWrite && (
              <>
                <Button
                  size="sm" variant={drawMode === "arrow" ? "default" : "ghost"}
                  onClick={() => setDrawMode((m) => (m === "arrow" ? "off" : "arrow"))}
                  title="Draw arrow"
                >
                  ↗
                </Button>
                <Button
                  size="sm" variant={drawMode === "circle" ? "default" : "ghost"}
                  onClick={() => setDrawMode((m) => (m === "circle" ? "off" : "circle"))}
                  title="Draw circle"
                >
                  ◯
                </Button>
                <Button
                  size="sm" variant={drawMode === "freehand" ? "default" : "ghost"}
                  onClick={() => setDrawMode((m) => (m === "freehand" ? "off" : "freehand"))}
                  title="Freehand"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={handleClipAnalyze}
                  disabled={clipAnalyzing || videoStorage !== "cloud"}
                  title={videoStorage !== "cloud" ? "Upload to cloud first" : "Analyze ±5s clip"}
                >
                  {clipAnalyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  <span className="ml-1 text-xs">Clip AI</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Timeline scrubber + bookmark markers */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-2">
            {bookmarks.map((b) => {
              const left = duration > 0 ? (b.start_sec / duration) * 100 : 0;
              return (
                <div
                  key={b.id}
                  className="pointer-events-auto absolute top-3 h-2 w-1.5 -translate-x-1/2 cursor-pointer rounded-sm"
                  style={{ left: `${left}%`, backgroundColor: b.color ?? "#22d3ee" }}
                  title={`${b.label} @ ${fmt(b.start_sec)}`}
                  onClick={() => seek(b.start_sec)}
                />
              );
            })}
          </div>
        </div>

        {/* Pitch sync — click to tag at current video time */}
        <div className="flex-1 min-h-0">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span><TagIcon className="mr-1 inline size-3" />Click pitch to tag at <b className="text-foreground">{fmt(currentTime)}</b></span>
            <span className="text-[10px]">J/K/L · ←/→ frame</span>
          </div>
          <Pitch
            onClick={(x, y) => {
              if (!allowWrite) return;
              onPitchClick(currentTime);
              // pass x/y back via a custom mechanism? we use onPitchClick alone — parent will use its own pendingType
              // For coordinates, parent supplies them via its own pitch click flow inside parent component.
              // Simpler: parent registers a bridge by using onPitchClick(currentTime), and tagging UI handles xy via separate handler.
              void x; void y;
            }}
            className="h-full max-h-[260px] w-full"
          />
        </div>
      </div>

      {/* Right: bookmarks panel */}
      <div className="flex min-h-0 flex-col gap-2 rounded-md border border-border bg-background/40 p-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <BookmarkIcon className="size-3.5" /> Clips
          </div>
          {videoStorage === "cloud" && allowWrite && (
            <Button size="sm" variant="ghost" onClick={onAIAnalyze} disabled={aiAnalyzing} title="Auto-scan with AI">
              {aiAnalyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              <span className="ml-1">Auto-scan</span>
            </Button>
          )}
        </div>

        {allowWrite && (
          <div className="space-y-2 rounded border border-border/70 bg-surface/50 p-2">
            <Input
              value={bookmarkInLabel}
              onChange={(e) => setBookmarkInLabel(e.target.value)}
              placeholder="Clip name (e.g. 'Goal 1')"
              className="h-7 text-xs"
            />
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 flex-1" onClick={setIn}>
                In {bookmarkInStart !== null && <span className="ml-1 font-mono text-[10px] text-primary">{fmt(bookmarkInStart)}</span>}
              </Button>
              <Button size="sm" variant="outline" className="h-7 flex-1" onClick={setOut} disabled={bookmarkInStart === null || !bookmarkInLabel.trim()}>
                Out
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {bookmarks.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted-foreground">
              No clips yet
            </div>
          )}
          {bookmarks.map((b) => (
            <div key={b.id} className="group flex items-center gap-2 rounded border border-border bg-background/60 p-1.5">
              <button
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: b.color ?? "#22d3ee" }}
                onClick={() => seek(b.start_sec)}
              />
              <button className="flex-1 truncate text-left hover:text-primary" onClick={() => seek(b.start_sec)}>
                <div className="truncate font-medium">{b.label}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {fmt(b.start_sec)}{b.end_sec != null && ` → ${fmt(b.end_sec)}`}
                </div>
              </button>
              {allowWrite && (
                <button
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => onDeleteBookmark(b.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {visibleAnnotations.length > 0 && allowWrite && (
          <div className="border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Visible annotations</span>
              <Badge variant="outline" className="text-[10px]">{visibleAnnotations.length}</Badge>
            </div>
            <div className="space-y-1">
              {visibleAnnotations.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded border border-border bg-background/60 px-2 py-1">
                  <span className="capitalize">{a.shape}</span>
                  <button onClick={() => onDeleteAnnotation(a.id)} className="text-muted-foreground hover:text-destructive">
                    <Eraser className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnnotationShape({ a }: { a: Annotation }) {
  const color = a.color ?? "#facc15";
  if (a.shape === "arrow" && a.data.points && a.data.points.length >= 2) {
    const [s, e] = a.data.points;
    return (
      <g style={{ color }}>
        <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={color} strokeWidth="0.6" markerEnd="url(#arrowhead)" />
      </g>
    );
  }
  if (a.shape === "circle" && a.data.x != null && a.data.y != null && a.data.r != null) {
    return <circle cx={a.data.x} cy={a.data.y} r={a.data.r} fill="none" stroke={color} strokeWidth="0.6" />;
  }
  if (a.shape === "freehand" && a.data.points && a.data.points.length > 1) {
    return (
      <polyline
        points={a.data.points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none" stroke={color} strokeWidth="0.6"
      />
    );
  }
  return null;
}

// re-export so parent can map pitch coords if needed
export { yToSvg };
