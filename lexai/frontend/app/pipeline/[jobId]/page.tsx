"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  FileText, CheckCircle, AlertCircle, RefreshCw,
  Database, Hash, Cpu, Shield, ChevronRight,
  Clock, Zap, ArrowRight, FileSearch, BarChart2
} from "lucide-react";

// API calls go through Next.js proxy (next.config.js rewrites /api → :8000/api)

// ── Types ──────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "retrying" | "failed";

interface StageState {
  status:      StageStatus;
  message:     string;
  startedAt:   number | null; // timestamp ms
  completedAt: number | null;
  elapsedMs:   number;
  progress:    number;         // 0–100
  preview:     Record<string, unknown> | null;
}

interface PipelineEvent {
  stage:   "extraction" | "validation" | "headnote" | "indexing" | "complete" | "error";
  status:  "running" | "done" | "retrying" | "failed";
  message?: string;
  preview?: Record<string, unknown>;
  caseId?:  string;
  error?:   string;
}

// ── Agent definitions ────────────────────────────────────────────────────
const AGENTS = [
  {
    key:         "extraction" as const,
    code:        "AGT-1",
    label:       "Extraction Agent",
    description: "Parsing judgment structure · Identifying sections · Classifying legal categories",
    icon:        FileSearch,
    color:       "var(--primary)",
    glow:        "rgba(59,127,245,0.25)",
    bgAccent:    "rgba(59,127,245,0.08)",
  },
  {
    key:         "validation" as const,
    code:        "AGT-2",
    label:       "Validation Agent",
    description: "Grounding each field against original source · Calculating confidence scores",
    icon:        Shield,
    color:       "var(--accent)",
    glow:        "rgba(0,212,170,0.25)",
    bgAccent:    "rgba(0,212,170,0.08)",
  },
  {
    key:         "headnote" as const,
    code:        "AGT-3",
    label:       "Headnote Agent",
    description: "Generating SCC-style legal headnote · Summarising ratio decidendi",
    icon:        Hash,
    color:       "var(--warning)",
    glow:        "rgba(245,158,11,0.25)",
    bgAccent:    "rgba(245,158,11,0.08)",
  },
  {
    key:         "indexing" as const,
    code:        "AGT-4",
    label:       "Index Agent",
    description: "Writing structured data to NeonDB · Generating embeddings · Uploading to Qdrant",
    icon:        Database,
    color:       "#A78BFA",
    glow:        "rgba(167,139,250,0.25)",
    bgAccent:    "rgba(167,139,250,0.08)",
  },
];

const STAGE_INDEX: Record<string, number> = {
  extraction: 0, validation: 1, headnote: 2, indexing: 3,
};

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function totalProgress(stages: Record<string, StageState>): number {
  const weights = [25, 25, 25, 25];
  return AGENTS.reduce((acc, ag, i) => {
    const s = stages[ag.key].status;
    if (s === "done") return acc + weights[i];
    if (s === "running" || s === "retrying") return acc + weights[i] * 0.5;
    return acc;
  }, 0);
}

function statusColor(s: StageStatus): string {
  return s === "idle"     ? "var(--text-3)"
       : s === "running"  ? "var(--warning)"
       : s === "retrying" ? "var(--warning)"
       : s === "done"     ? "var(--accent)"
       : "var(--danger)";
}

function statusLabel(s: StageStatus): string {
  return s === "idle"     ? "Waiting"
       : s === "running"  ? "Running"
       : s === "retrying" ? "Retrying"
       : s === "done"     ? "Complete"
       : "Failed";
}

// ── Main Component ───────────────────────────────────────────────────────
export default function PipelinePage() {
  const router  = useRouter();
  const params  = useParams();
  const jobId   = params?.jobId as string;

  const initialStage = (): StageState => ({
    status: "idle", message: "", startedAt: null, completedAt: null,
    elapsedMs: 0, progress: 0, preview: null,
  });

  const [stages, setStages] = useState<Record<string, StageState>>({
    extraction: initialStage(),
    validation: initialStage(),
    headnote:   initialStage(),
    indexing:   initialStage(),
  });
  const [globalStart]  = useState<number>(Date.now());
  const [globalElapsed, setGlobalElapsed] = useState(0);
  const [pipelineDone, setPipelineDone]   = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [caseId, setCaseId]               = useState<string | null>(null);
  const [fileName, setFileName]           = useState<string>("Processing...");

  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Global elapsed timer
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setGlobalElapsed(Date.now() - globalStart);
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [globalStart]);

  // Per-agent elapsed update
  const startAgentTimer = useCallback((key: string) => {
    if (stageTimers.current[key]) clearInterval(stageTimers.current[key]);
    stageTimers.current[key] = setInterval(() => {
      setStages(prev => {
        const s = prev[key];
        if (!s.startedAt || s.status === "done" || s.status === "failed") return prev;
        const elapsed = Date.now() - s.startedAt;
        // Smooth auto-increment: trickle up by 1% every 500ms, cap at 92%
        const newProgress = Math.min(92, s.progress + 0.5);
        return { ...prev, [key]: { ...s, elapsedMs: elapsed, progress: newProgress } };
      });
    }, 500);
  }, []);

  const stopAgentTimer = useCallback((key: string) => {
    if (stageTimers.current[key]) clearInterval(stageTimers.current[key]);
  }, []);

  // Read filename from URL query param or sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(`pipeline_file_${jobId}`);
    if (stored) setFileName(stored);
  }, [jobId]);

  // SSE connection — uses Next.js proxy → FastAPI
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/stream/${jobId}`);

    es.onmessage = (event) => {
      try {
        const parsed: PipelineEvent = JSON.parse(event.data);
        const { stage, status, message, preview, caseId: cId, error: errMsg } = parsed;

        if (stage === "complete") {
          es.close();
          if (errMsg || status === "failed") {
            setPipelineError(errMsg || "Pipeline failed. Please try again.");
          } else if (cId) {
            setCaseId(cId);
            setPipelineDone(true);
          } else {
            setPipelineDone(true);
          }
          if (tickRef.current) clearInterval(tickRef.current);
          return;
        }

        const key = stage as string;
        if (!STAGE_INDEX.hasOwnProperty(key)) return;

        setStages(prev => {
          const existing = prev[key];
          const now = Date.now();
          let startedAt = existing.startedAt;
          let completedAt = existing.completedAt;
          let elapsedMs  = existing.elapsedMs;

          if (status === "running" && !startedAt) {
            startedAt = now;
            startAgentTimer(key);
          }
          if ((status === "done" || status === "failed") && startedAt) {
            completedAt = now;
            elapsedMs   = now - startedAt;
            stopAgentTimer(key);
          }
          if (status === "retrying" && !startedAt) {
            startedAt = now;
            startAgentTimer(key);
          }

          // Determine progress %
          let progress = existing.progress;
          if (status === "running" && progress === 0) progress = 8;
          if (status === "running") {
            const beProg = preview?.progress as number | undefined;
            if (beProg !== undefined) progress = Math.min(99, beProg);
            else if (progress < 92) progress = Math.max(progress, 10);
          }
          if (status === "done")   progress = 100;
          if (status === "failed") progress = progress;

          return {
            ...prev,
            [key]: {
              ...existing,
              status:   status as StageStatus,
              message:  message || existing.message,
              startedAt,
              completedAt,
              elapsedMs,
              progress,
              preview:  preview || existing.preview,
            },
          };
        });
      } catch { /* silent */ }
    };

    es.onerror = () => {
      setPipelineError("Connection to pipeline lost. Check server status.");
      es.close();
    };

    return () => { es.close(); };
  }, [jobId, startAgentTimer, stopAgentTimer]);

  const progress = totalProgress(stages);
  const activeAgent = AGENTS.find(a => stages[a.key].status === "running" || stages[a.key].status === "retrying");

  return (
    <div style={{
      minHeight:   "100vh",
      background:  "var(--bg)",
      display:     "flex",
      flexDirection: "column",
    }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header style={{
        height:       "var(--navbar-h)",
        background:   "var(--bg-2)",
        borderBottom: "1px solid var(--border)",
        display:      "flex",
        alignItems:   "center",
        padding:      "0 32px",
        gap:          "20px",
        position:     "sticky",
        top:          0,
        zIndex:       40,
      }}>
        <div style={{
          width:          "32px",
          height:         "32px",
          borderRadius:   "8px",
          background:     "linear-gradient(135deg, var(--primary), var(--accent))",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}>
          <span style={{ color: "white", fontSize: "16px" }}>⚖</span>
        </div>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: "16px", color: "var(--text-1)" }}>
          LexAI
        </span>
        <ChevronRight size={14} color="var(--text-3)" />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-3)" }}>
          Pipeline
        </span>
        <ChevronRight size={14} color="var(--text-3)" />
        <span style={{
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    "12px",
          color:       "var(--text-2)",
          maxWidth:    "300px",
          overflow:    "hidden",
          textOverflow:"ellipsis",
          whiteSpace:  "nowrap",
        }}>
          {fileName}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Global elapsed */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={13} color="var(--text-3)" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: pipelineDone ? "var(--accent)" : "var(--warning)" }}>
              {fmtMs(globalElapsed)}
            </span>
          </div>
          <span style={{
            fontFamily:   "'JetBrains Mono', monospace",
            fontSize:     "11px",
            color:        "var(--primary)",
            background:   "var(--primary-glow)",
            padding:      "3px 10px",
            borderRadius: "6px",
            border:       "1px solid rgba(59,127,245,0.2)",
          }}>
            JOB #{jobId?.slice(-8).toUpperCase()}
          </span>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <main style={{ flex: 1, padding: "40px 48px", maxWidth: "1200px", width: "100%", margin: "0 auto" }}>

        {/* Header section */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
            <div>
              <h1 style={{
                fontFamily:    "'DM Serif Display', serif",
                fontSize:      "34px",
                fontWeight:    "400",
                color:         "var(--text-1)",
                marginBottom:  "8px",
                letterSpacing: "-0.5px",
              }}>
                {pipelineDone ? "Processing Complete" : pipelineError ? "Pipeline Failed" : "Processing Judgment"}
              </h1>
              <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
                {pipelineDone
                  ? "All agents completed successfully. Judgment is indexed and ready to query."
                  : pipelineError
                  ? "An error occurred during processing."
                  : activeAgent
                  ? `${activeAgent.label} is running…`
                  : "Initializing pipeline…"
                }
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                fontFamily:   "'JetBrains Mono', monospace",
                fontSize:     "28px",
                fontWeight:   "500",
                color:        pipelineDone ? "var(--accent)" : pipelineError ? "var(--danger)" : "var(--primary)",
              }}>
                {Math.round(progress)}%
              </div>
            </div>
          </div>

          {/* Master progress bar */}
          <div style={{
            height:       "8px",
            background:   "var(--surface)",
            borderRadius: "4px",
            overflow:     "hidden",
            border:       "1px solid var(--border)",
          }}>
            <div style={{
              height:      "100%",
              width:       `${progress}%`,
              background:  pipelineError
                ? "var(--danger)"
                : pipelineDone
                ? "linear-gradient(90deg, var(--primary), var(--accent))"
                : `linear-gradient(90deg, var(--primary), var(--accent))`,
              borderRadius:"4px",
              transition:  "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              position:    "relative",
              overflow:    "hidden",
            }}>
              {!pipelineDone && !pipelineError && (
                <div style={{
                  position:       "absolute",
                  inset:          0,
                  background:     "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                  animation:      "shimmer 2s infinite",
                  backgroundSize: "200% 100%",
                }} />
              )}
            </div>
          </div>

          {/* Step dots */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
            {AGENTS.map((ag, i) => {
              const s = stages[ag.key].status;
              return (
                <div key={ag.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width:        "8px",
                    height:       "8px",
                    borderRadius: "50%",
                    background:   statusColor(s),
                    boxShadow:    s === "running" || s === "retrying" ? `0 0 8px ${ag.color}` : "none",
                    transition:   "background 0.3s",
                  }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: statusColor(s) }}>
                    {ag.code}
                  </span>
                  {i < AGENTS.length - 1 && (
                    <div style={{ width: "60px", height: "1px", background: "var(--border)", margin: "0 4px" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Agent Cards ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {AGENTS.map((ag, idx) => {
            const st       = stages[ag.key];
            const isActive = st.status === "running" || st.status === "retrying";
            const isDone   = st.status === "done";
            const isFailed = st.status === "failed";
            const isIdle   = st.status === "idle";
            const Icon     = ag.icon;

            return (
              <div
                key={ag.key}
                style={{
                  background:   "var(--surface)",
                  border:       `1px solid ${isActive ? ag.color : isDone ? "rgba(0,212,170,0.3)" : isFailed ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                  borderRadius: "16px",
                  overflow:     "hidden",
                  transition:   "border-color 0.4s ease, box-shadow 0.4s ease",
                  boxShadow:    isActive ? `0 0 24px ${ag.glow}` : "var(--shadow)",
                  opacity:      isIdle ? 0.5 : 1,
                  animation:    idx < 2 ? `pageIn 0.4s ${idx * 0.1}s both` : "none",
                }}
              >
                {/* Top strip color */}
                {isActive && (
                  <div style={{
                    height:     "3px",
                    background: `linear-gradient(90deg, ${ag.color}, transparent)`,
                    animation:  "shimmer 2s infinite",
                    backgroundSize: "200% 100%",
                  }} />
                )}
                {isDone && (
                  <div style={{ height: "3px", background: "linear-gradient(90deg, var(--accent), transparent)" }} />
                )}
                {isFailed && (
                  <div style={{ height: "3px", background: "linear-gradient(90deg, var(--danger), transparent)" }} />
                )}

                <div style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    {/* Icon bubble */}
                    <div style={{
                      width:          "54px",
                      height:         "54px",
                      borderRadius:   "14px",
                      background:     isActive ? ag.bgAccent : isDone ? "rgba(0,212,170,0.08)" : "var(--bg)",
                      border:         `1px solid ${isActive ? ag.color : isDone ? "rgba(0,212,170,0.2)" : "var(--border)"}`,
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      flexShrink:     0,
                      position:       "relative",
                      transition:     "background 0.4s, border-color 0.4s",
                    }}>
                      {/* Pulse ring for active */}
                      {isActive && (
                        <div style={{
                          position:     "absolute",
                          inset:        "-4px",
                          borderRadius: "18px",
                          border:       `2px solid ${ag.color}`,
                          opacity:      0.4,
                          animation:    "pulse-glow 1.5s ease-in-out infinite",
                        }} />
                      )}
                      {isDone
                        ? <CheckCircle size={22} color="var(--accent)" />
                        : isFailed
                        ? <AlertCircle size={22} color="var(--danger)" />
                        : st.status === "retrying"
                        ? <RefreshCw size={22} color={ag.color} style={{ animation: "spin 1s linear infinite" }} />
                        : <Icon size={22} color={isActive ? ag.color : "var(--text-3)"} />
                      }
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <span style={{
                          fontFamily:   "'JetBrains Mono', monospace",
                          fontSize:     "10px",
                          color:        ag.color,
                          background:   ag.bgAccent,
                          padding:      "2px 8px",
                          borderRadius: "4px",
                          border:       `1px solid ${ag.color}30`,
                        }}>
                          {ag.code}
                        </span>
                        <h3 style={{
                          fontFamily:    "'DM Serif Display', serif",
                          fontSize:      "18px",
                          fontWeight:    "400",
                          color:         isIdle ? "var(--text-3)" : "var(--text-1)",
                          letterSpacing: "-0.3px",
                          transition:    "color 0.3s",
                        }}>
                          {ag.label}
                        </h3>
                        {/* Status badge */}
                        <span style={{
                          fontFamily:   "'JetBrains Mono', monospace",
                          fontSize:     "10px",
                          color:        statusColor(st.status),
                          background:   `${statusColor(st.status)}14`,
                          padding:      "2px 8px",
                          borderRadius: "4px",
                          border:       `1px solid ${statusColor(st.status)}30`,
                          textTransform:"uppercase",
                          letterSpacing:"0.5px",
                        }}>
                          {statusLabel(st.status)}
                        </span>
                      </div>

                      <p style={{
                        fontSize:   "13px",
                        color:      "var(--text-2)",
                        lineHeight: "1.5",
                        marginBottom: st.message || st.preview ? "12px" : "0",
                      }}>
                        {st.message || ag.description}
                      </p>

                      {/* Live message ticker when running */}
                      {isActive && st.message && (
                        <div style={{
                          display:      "flex",
                          alignItems:   "center",
                          gap:          "8px",
                          padding:      "8px 12px",
                          background:   ag.bgAccent,
                          borderRadius: "8px",
                          border:       `1px solid ${ag.color}20`,
                          marginBottom: "12px",
                        }}>
                          <Zap size={12} color={ag.color} />
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize:   "12px",
                            color:      "var(--text-2)",
                          }}>
                            {st.message}
                          </span>
                          <span style={{
                            marginLeft:   "auto",
                            width:        "6px",
                            height:       "6px",
                            borderRadius: "50%",
                            background:   ag.color,
                            animation:    "pulse-glow 1s infinite",
                          }} />
                        </div>
                      )}

                      {/* ── Per-agent progress bar ────────────────── */}
                      {!isIdle && (
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--text-3)" }}>
                              {isDone ? "Completed" : isFailed ? "Failed" : "Progress"}
                            </span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: "600", color: isDone ? "var(--accent)" : isFailed ? "var(--danger)" : ag.color }}>
                              {st.progress}%
                            </span>
                          </div>
                          <div style={{ height: "6px", background: "var(--bg)", borderRadius: "3px", overflow: "hidden", border: "1px solid var(--border)" }}>
                            <div style={{
                              height:      "100%",
                              width:       `${st.progress}%`,
                              background:  isDone
                                ? "linear-gradient(90deg, var(--accent), #4ade80)"
                                : isFailed
                                ? "var(--danger)"
                                : `linear-gradient(90deg, ${ag.color}, ${ag.color}cc)`,
                              borderRadius:"3px",
                              transition:  "width 0.5s cubic-bezier(0.4,0,0.2,1)",
                              position:    "relative",
                              overflow:    "hidden",
                            }}>
                              {isActive && (
                                <div style={{
                                  position:       "absolute", inset: 0,
                                  background:     "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                                  animation:      "shimmer 1.5s infinite",
                                  backgroundSize: "200% 100%",
                                }} />
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Preview chips */}
                      {st.preview && Object.keys(st.preview).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "4px" }}>
                          {Object.entries(st.preview).map(([k, v]) => (
                            <span key={k} style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
                              color: "var(--text-2)", background: "var(--bg)",
                              border: "1px solid var(--border)", padding: "3px 10px",
                              borderRadius: "5px", maxWidth: "280px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              <span style={{ color: "var(--text-3)" }}>{k}:</span>{" "}
                              {Array.isArray(v)
                                ? (v as string[]).slice(0, 3).join(", ") + (v.length > 3 ? "…" : "")
                                : typeof v === "number"
                                ? (v as number).toFixed(2)
                                : String(v).slice(0, 60)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: elapsed time */}
                    <div style={{
                      textAlign:  "right",
                      flexShrink: 0,
                      minWidth:   "80px",
                    }}>
                      {(isActive || isDone || isFailed) && (
                        <>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize:   "20px",
                            fontWeight: "500",
                            color:      isDone ? "var(--accent)" : isFailed ? "var(--danger)" : ag.color,
                            marginBottom:"4px",
                            transition: "color 0.3s",
                          }}>
                            {fmtMs(isDone || isFailed ? st.elapsedMs : st.elapsedMs)}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                            {isDone ? "elapsed" : isFailed ? "until fail" : "elapsed…"}
                          </div>
                        </>
                      )}
                      {isIdle && (
                        <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                          Queued
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Error Panel ─────────────────────────────────────── */}
        {pipelineError && (
          <div style={{
            marginTop:    "28px",
            background:   "rgba(239,68,68,0.08)",
            border:       "1px solid rgba(239,68,68,0.25)",
            borderRadius: "14px",
            padding:      "24px",
            display:      "flex",
            alignItems:   "flex-start",
            gap:          "16px",
            animation:    "pageIn 0.3s ease",
          }}>
            <AlertCircle size={22} color="var(--danger)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--danger)", marginBottom: "6px" }}>
                Pipeline Error
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "'JetBrains Mono', monospace" }}>
                {pipelineError}
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              style={{
                marginLeft:   "auto",
                padding:      "8px 18px",
                background:   "var(--danger)",
                color:        "white",
                border:       "none",
                borderRadius: "8px",
                cursor:       "pointer",
                fontSize:     "13px",
                fontWeight:   "600",
                flexShrink:   0,
              }}
            >
              Back to Dashboard
            </button>
          </div>
        )}

        {/* ── Completion Panel ─────────────────────────────────── */}
        {pipelineDone && !pipelineError && (
          <div style={{
            marginTop:    "28px",
            background:   "rgba(0,212,170,0.06)",
            border:       "1px solid rgba(0,212,170,0.25)",
            borderRadius: "16px",
            padding:      "28px 32px",
            display:      "flex",
            alignItems:   "center",
            gap:          "24px",
            animation:    "pageIn 0.4s ease",
          }}>
            <div style={{
              width:          "56px",
              height:         "56px",
              borderRadius:   "16px",
              background:     "rgba(0,212,170,0.1)",
              border:         "1px solid rgba(0,212,170,0.3)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}>
              <CheckCircle size={26} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily:   "'DM Serif Display', serif",
                fontSize:     "20px",
                fontWeight:   "400",
                color:        "var(--text-1)",
                marginBottom: "6px",
              }}>
                Judgment processed successfully
              </div>
              <div style={{ display: "flex", gap: "20px", fontSize: "12px", color: "var(--text-2)" }}>
                <span>
                  Total time: <strong style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtMs(globalElapsed)}
                  </strong>
                </span>
                <span>
                  LLM calls: <strong style={{ color: "var(--primary)", fontFamily: "'JetBrains Mono', monospace" }}>
                    3–4
                  </strong>
                </span>
                <span>
                  Confidence: <strong style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {stages.validation.preview?.["avg_confidence"]
                      ? `${Math.round(Number(stages.validation.preview["avg_confidence"]) * 100)}%`
                      : "—"
                    }
                  </strong>
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {caseId && (
                <button
                  onClick={() => router.push(`/case/${caseId}`)}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "8px",
                    padding:      "10px 22px",
                    background:   "var(--accent)",
                    color:        "#0A0F1E",
                    border:       "none",
                    borderRadius: "10px",
                    cursor:       "pointer",
                    fontSize:     "14px",
                    fontWeight:   "700",
                    whiteSpace:   "nowrap",
                  }}
                >
                  View Case <ArrowRight size={16} />
                </button>
              )}
              <button
                onClick={() => router.push("/search")}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "8px",
                  padding:      "10px 22px",
                  background:   "var(--primary-glow)",
                  color:        "var(--primary)",
                  border:       "1px solid rgba(59,127,245,0.3)",
                  borderRadius: "10px",
                  cursor:       "pointer",
                  fontSize:     "13px",
                  fontWeight:   "600",
                  whiteSpace:   "nowrap",
                }}
              >
                <BarChart2 size={14} /> Search Judgments
              </button>
            </div>
          </div>
        )}

        {/* ── Analytics row ── timing breakdown ───────────────── */}
        {(pipelineDone || AGENTS.some(a => stages[a.key].status !== "idle")) && (
          <div style={{ marginTop: "28px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {AGENTS.map(ag => {
              const st = stages[ag.key];
              const hasTime = st.elapsedMs > 0;
              return (
                <div key={ag.key} className="glass" style={{ padding: "16px", opacity: hasTime ? 1 : 0.4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <ag.icon size={14} color={ag.color} />
                    <span style={{ fontSize: "11px", color: "var(--text-2)", fontWeight: "500" }}>{ag.label}</span>
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize:   "18px",
                    fontWeight: "500",
                    color:      hasTime ? ag.color : "var(--text-3)",
                    marginBottom:"2px",
                  }}>
                    {hasTime ? fmtMs(st.elapsedMs) : "—"}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-3)" }}>
                    {st.status === "idle" ? "Not started" : statusLabel(st.status)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
