"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar        from "@/components/layout/Sidebar";
import Navbar         from "@/components/layout/Navbar";
import PageTransition from "@/components/layout/PageTransition";
import {
  FileText, CheckCircle, Clock, TrendingUp,
  Upload, AlertCircle, RefreshCw, Cpu,
} from "lucide-react";
import { apiGet, apiUpload } from "@/lib/api";
import { SkeletonCard } from "@/components/ui/LoadingSpinner";
import ProcessingQueue from "@/components/dashboard/ProcessingQueue";

interface CaseRecord {
  id:                 string;
  file_name:          string;
  case_title?:        string;
  court_and_date?:    string;
  outcome?:           string;
  overall_confidence?: number;
  created_at?:        string;
}

interface DashboardStats {
  total_cases:      number;
  avg_confidence:   number;
  queue_length?:    number;
  api_calls_today:  number;
  api_calls_limit:  number;
}

function outcomeColor(outcome?: string) {
  if (!outcome) return "var(--text-3)";
  const o = outcome.toLowerCase();
  if (o.includes("allow") || o.includes("acquit")) return "var(--accent)";
  if (o.includes("dismiss") || o.includes("convict")) return "var(--danger)";
  return "var(--warning)";
}

function confColor(c: number) {
  if (c > 0.85) return "var(--accent)";
  if (c > 0.7)  return "var(--warning)";
  return "var(--danger)";
}

export default function Dashboard() {
  const router = useRouter();
  const [cases,    setCases]    = useState<CaseRecord[]>([]);
  const [stats,    setStats]    = useState<DashboardStats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading,setUploading]= useState(false);
  const [activeJobs, setActiveJobs] = useState<Array<{job_id: string; file_name: string}>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Cap skeleton display at 2 seconds even if API is slow
    const timeout = setTimeout(() => setLoading(false), 2000);

    Promise.all([
      apiGet<{ cases?: CaseRecord[]; total?: number } | CaseRecord[]>("/api/cases?limit=6&order=desc"),
      apiGet<DashboardStats>("/api/analytics/summary"),
    ])
      .then(([casesResp, statsResp]) => {
        const list = Array.isArray(casesResp)
          ? casesResp
          : (casesResp as { cases?: CaseRecord[] }).cases || [];
        setCases(list.slice(0, 5));
        setStats(statsResp);
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setLoading(false); });

    return () => clearTimeout(timeout);
  }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setUploading(true);
    try {
      const data = await apiUpload("/api/upload", file);
      const id = (data as unknown as { jobId?: string }).jobId || data.job_id;
      if (id) {
        sessionStorage.setItem(`pipeline_file_${id}`, file.name);
        // Add to active jobs so ProcessingQueue shows live progress
        setActiveJobs(prev => [...prev, { job_id: id, file_name: file.name }]);
        router.push(`/pipeline/${id}`);
      }
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const STAT_CARDS = [
    {
      label: "Cases Processed",
      value: stats ? String(stats.total_cases) : "—",
      icon: FileText, color: "var(--primary)",
    },
    {
      label: "Avg Confidence",
      value: stats && stats.avg_confidence != null ? `${Math.round(stats.avg_confidence * 100)}%` : "—",
      icon: TrendingUp, color: "var(--accent)",
    },
    {
      label: "Active Pipelines",
      value: stats ? String(stats.queue_length || 0) : "—",
      icon: Cpu, color: "var(--warning)",
    },
    {
      label: "API Calls Today",
      value: stats ? `${stats.api_calls_today}/${stats.api_calls_limit || 20}` : "—",
      icon: CheckCircle, color: "var(--danger)",
    },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Navbar title="Dashboard" onUpload={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
        />
        <PageTransition>
          <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>

            {/* Welcome */}
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: "26px", fontWeight: "400", color: "var(--text-1)", marginBottom: "6px",
              }}>
                Welcome back, Himanshu
              </h2>
              <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
                {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
              </p>
            </div>

            {/* Stats Row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"16px", marginBottom:"28px" }}>
              {loading
                ? Array(4).fill(0).map((_, i) => <SkeletonCard key={i} lines={1} />)
                : STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="glass" style={{ padding: "20px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
                      <div style={{
                        width:"38px", height:"38px", borderRadius:"10px",
                        background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        <Icon size={18} color={color} />
                      </div>
                    </div>
                    <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"26px", fontWeight:"500", color:"var(--text-1)", marginBottom:"4px" }}>
                      {value}
                    </div>
                    <div style={{ fontSize:"12px", color:"var(--text-2)" }}>{label}</div>
                  </div>
                ))
              }
            </div>

            {/* Main Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:"20px" }}>

              {/* Recent Cases */}
              <div className="glass" style={{ padding:"24px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                  <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", fontWeight:"400" }}>
                    Recent Judgments
                  </h3>
                  <a href="/search" style={{ fontSize:"12px", color:"var(--primary)", textDecoration:"none", fontWeight:"500" }}>
                    View all →
                  </a>
                </div>

                {loading ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                    {Array(4).fill(0).map((_, i) => (
                      <div key={i} className="skeleton" style={{ height:"60px", borderRadius:"10px" }} />
                    ))}
                  </div>
                ) : cases.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 20px", color:"var(--text-3)", fontSize:"13px" }}>
                    <AlertCircle size={32} style={{ margin:"0 auto 12px", opacity:0.4 }} />
                    No cases yet. Upload a judgment to get started.
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                    {cases.map((c) => (
                      <a key={c.id} href={`/case/${c.id}`} style={{ textDecoration:"none" }}>
                        <div className="result-card" style={{
                          display:"flex", alignItems:"center", gap:"14px",
                          padding:"14px", borderRadius:"10px",
                          background:"var(--bg)", border:"1px solid var(--border)",
                          cursor:"pointer", transition:"var(--transition)",
                        }}>
                          <div style={{
                            width:"40px", height:"40px", borderRadius:"10px",
                            background:`${outcomeColor(c.outcome)}18`,
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                          }}>
                            <FileText size={16} color={outcomeColor(c.outcome)} />
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:"13px", fontWeight:"500", color:"var(--text-1)", marginBottom:"4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {c.case_title || c.file_name || `Case ${c.id}`}
                            </div>
                            <div style={{ fontSize:"12px", color:"var(--text-2)", display:"flex", gap:"8px" }}>
                              {c.court_and_date && <span>{c.court_and_date}</span>}
                              {c.outcome && (
                                <><span>·</span><span style={{ color:outcomeColor(c.outcome), textTransform:"capitalize" }}>{c.outcome}</span></>
                              )}
                            </div>
                          </div>
                          {c.overall_confidence != null && (
                            <div style={{ textAlign:"right", flexShrink:0 }}>
                              <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"13px", fontWeight:"500", color:confColor(c.overall_confidence), marginBottom:"2px" }}>
                                {Math.round(c.overall_confidence * 100)}%
                              </div>
                              <div style={{ fontSize:"11px", color:"var(--text-3)" }}>confidence</div>
                            </div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Right column */}
              <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>

                {/* Upload Zone */}
                <div className="glass" style={{ padding:"24px" }}>
                  <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", fontWeight:"400", marginBottom:"16px" }}>
                    Upload Judgment
                  </h3>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => !uploading && fileRef.current?.click()}
                    style={{
                      border:       `2px dashed ${dragging ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "12px",
                      padding:      "36px 20px",
                      textAlign:    "center",
                      background:   dragging ? "var(--primary-glow)" : "var(--bg)",
                      transition:   "var(--transition)",
                      cursor:       uploading ? "wait" : "pointer",
                    }}
                  >
                    <div style={{
                      width:"48px", height:"48px", borderRadius:"12px",
                      background:"var(--primary-glow)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      margin:"0 auto 14px",
                      animation: dragging || uploading ? "pulse-glow 1s infinite" : "none",
                    }}>
                      {uploading
                        ? <RefreshCw size={20} color="var(--primary)" style={{ animation:"spin 1s linear infinite" }} />
                        : <Upload size={20} color="var(--primary)" />
                      }
                    </div>
                    <p style={{ fontSize:"14px", fontWeight:"500", color:"var(--text-1)", marginBottom:"6px" }}>
                      {uploading ? "Uploading…" : "Drop PDF here"}
                    </p>
                    <p style={{ fontSize:"12px", color:"var(--text-3)" }}>
                      or click to browse · PDF only
                    </p>
                  </div>
                </div>

                {/* Processing Queue / Pipeline Info */}
                <div className="glass" style={{ padding:"24px" }}>
                  <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", fontWeight:"400", marginBottom:"16px" }}>
                    Processing Queue
                  </h3>
                  <ProcessingQueue
                    jobs={activeJobs}
                    onComplete={(jobId, caseId) => {
                      setActiveJobs(prev => prev.filter(j => j.job_id !== jobId));
                      // Refresh case list
                      apiGet<{ cases?: CaseRecord[] } | CaseRecord[]>("/api/cases?limit=6&order=desc")
                        .then(r => {
                          const list = Array.isArray(r) ? r : (r as { cases?: CaseRecord[] }).cases || [];
                          setCases(list.slice(0, 5));
                        })
                        .catch(() => {});
                    }}
                  />
                  {activeJobs.length === 0 && (
                    <div style={{ marginTop:"16px", display:"flex", flexDirection:"column", gap:"6px" }}>
                      {["Extraction Agent", "Validation Agent", "Headnote Agent", "Index Agent"].map((a, i) => (
                        <div key={a} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 10px", background:"var(--bg)", borderRadius:"8px", border:"1px solid var(--border)" }}>
                          <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"10px", color:"var(--primary)", minWidth:"40px" }}>AGT-{i+1}</span>
                          <span style={{ fontSize:"12px", color:"var(--text-2)" }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </main>
        </PageTransition>
      </div>
    </div>
  );
}
