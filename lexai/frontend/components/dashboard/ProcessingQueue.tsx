"use client";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface Job {
  job_id:    string;
  file_name: string;
  status:    string;
  stage:     string;
  progress:  number;
  agent:     string;
}

interface Props {
  jobs: Array<{ job_id: string; file_name: string }>;
  onComplete?: (job_id: string, case_id: string) => void;
}

const AGENT_COLORS: Record<string, string> = {
  extraction: "var(--primary)",
  validation: "var(--accent)",
  headnote:   "var(--warning)",
  indexing:   "#A78BFA",
};

function stageColor(stage: string) {
  for (const [k, v] of Object.entries(AGENT_COLORS)) {
    if (stage.toLowerCase().includes(k)) return v;
  }
  return "var(--primary)";
}

export default function ProcessingQueue({ jobs, onComplete }: Props) {
  const [states, setStates] = useState<Record<string, Job>>({});

  useEffect(() => {
    const sources: EventSource[] = [];

    jobs.forEach(({ job_id, file_name }) => {
      // Initialize
      setStates(prev => ({
        ...prev,
        [job_id]: {
          job_id, file_name,
          status: "queued", stage: "Waiting…",
          progress: 0, agent: "",
        },
      }));

      const es = new EventSource(`/api/stream/${job_id}`);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const stage  = data.stage   || "";
          const status = data.status  || "";

          // Terminal: complete
          if (stage === "complete" && status === "done") {
            setStates(prev => ({
              ...prev,
              [job_id]: { ...prev[job_id], status: "complete", progress: 100, stage: "Done" },
            }));
            es.close();
            if (data.caseId) onComplete?.(job_id, data.caseId);
            return;
          }

          // Terminal: error
          if (status === "failed") {
            setStates(prev => ({
              ...prev,
              [job_id]: {
                ...prev[job_id],
                status: "failed",
                stage: data.error || data.message || "Failed",
              },
            }));
            es.close();
            return;
          }

          // Progress update
          if (stage && status) {
            setStates(prev => {
              const old = prev[job_id] || { job_id, file_name, status: "queued", stage: "", progress: 0, agent: "" };
              // Progress estimation based on stage+status
              let progress = old.progress;
              const stageWeights: Record<string, [number, number]> = {
                extraction: [10, 40],
                validation: [40, 65],
                headnote:   [65, 85],
                indexing:   [85, 98],
              };
              const w = stageWeights[stage];
              if (w) {
                progress = status === "done" ? w[1] : status === "running" ? Math.max(progress, w[0]) : progress;
                if (status === "retrying") progress = Math.max(progress, w[0] + 5);
              }

              return {
                ...prev,
                [job_id]: {
                  ...old,
                  status:   status === "done" ? "processing" : status,
                  stage:    data.message || `${stage} — ${status}`,
                  progress,
                  agent:    stage,
                },
              };
            });
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        setStates(prev => ({
          ...prev,
          [job_id]: {
            ...prev[job_id],
            status: "failed",
            stage: "Connection lost",
          },
        }));
        es.close();
      };

      sources.push(es);
    });

    return () => sources.forEach(s => s.close());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map(j => j.job_id).join(",")]);

  const active = Object.values(states).filter(j => j.status !== "complete");

  if (active.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "28px 0", color: "var(--text-3)", fontSize: "13px" }}>
        No active jobs
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {active.map(job => {
        const color = stageColor(job.agent);
        const failed = job.status === "failed";
        return (
          <div key={job.job_id}>
            {/* File + percentage */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{
                fontSize: "12px", fontWeight: "500", color: "var(--text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px",
              }}>
                {job.file_name}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: "600",
                color: failed ? "var(--danger)" : color,
              }}>
                {job.progress}%
              </span>
            </div>

            {/* Progress bar */}
            <div style={{
              height: "5px", background: "var(--bg)",
              borderRadius: "3px", overflow: "hidden", marginBottom: "6px",
              border: "1px solid var(--border)",
            }}>
              <div style={{
                height: "100%",
                width: `${job.progress}%`,
                background: failed
                  ? "var(--danger)"
                  : `linear-gradient(90deg, ${color}, var(--accent))`,
                borderRadius: "3px",
                transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                position: "relative",
                overflow: "hidden",
              }}>
                {!failed && job.progress < 100 && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    animation: "shimmer 1.5s infinite", backgroundSize: "200% 100%",
                  }} />
                )}
              </div>
            </div>

            {/* Stage + agent badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {!failed && job.progress > 0 && job.progress < 100 && (
                  <Zap size={10} color={color} />
                )}
                <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.stage}
                </span>
              </div>
              {job.agent && (
                <span style={{
                  background: `${color}18`, color,
                  padding: "1px 6px", borderRadius: "4px",
                  border: `1px solid ${color}30`,
                  textTransform: "capitalize", fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {job.agent}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
