"use client";
import { useEffect, useState } from "react";
import Sidebar        from "@/components/layout/Sidebar";
import Navbar         from "@/components/layout/Navbar";
import PageTransition from "@/components/layout/PageTransition";
import { apiGet } from "@/lib/api";
import { SkeletonCard } from "@/components/ui/LoadingSpinner";

interface AnalyticsData {
  section_confidence: Array<{ label: string; confidence: number }>;
  daily_usage:        Array<{ day: string; calls: number }>;
  calls_per_doc:      number;
  quota_used:         number;
  quota_limit:        number;
  docs_processable:   number;
  resets_in_hours:    number;
}

const FALLBACK: AnalyticsData = {
  section_confidence: [
    { label: "Facts",            confidence: 0.91 },
    { label: "Petitioner Args",  confidence: 0.87 },
    { label: "Respondent Args",  confidence: 0.84 },
    { label: "Law Sections",     confidence: 0.93 },
    { label: "Precedents",       confidence: 0.78 },
    { label: "Reasoning",        confidence: 0.90 },
    { label: "Final Order",      confidence: 0.96 },
  ],
  daily_usage:      [
    { day: "Mon", calls: 14 }, { day: "Tue", calls: 18 },
    { day: "Wed", calls: 11 }, { day: "Thu", calls: 20 },
    { day: "Fri", calls: 16 }, { day: "Sat", calls: 8  },
    { day: "Sun", calls: 5  },
  ],
  calls_per_doc:    4,
  quota_used:       14,
  quota_limit:      20,
  docs_processable: 1,
  resets_in_hours:  6,
};

function confColor(c: number) {
  if (c > 0.85) return "var(--accent)";
  if (c > 0.7)  return "var(--warning)";
  return "var(--danger)";
}

export default function AnalyticsPage() {
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AnalyticsData>("/api/analytics/detail")
      .then(setData)
      .catch(() => setData(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  const d = data || FALLBACK;
  const maxCalls = Math.max(...d.daily_usage.map(u => u.calls));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Navbar title="Analytics" />
        <PageTransition>
          <main style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
            <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"26px", fontWeight:"400", marginBottom:"6px" }}>
              Analytics
            </h2>
            <p style={{ color:"var(--text-2)", fontSize:"14px", marginBottom:"28px" }}>
              System performance, quota usage, and extraction quality
            </p>

            {loading ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
                <SkeletonCard lines={5} /><SkeletonCard lines={5} />
                <SkeletonCard lines={4} /><SkeletonCard lines={4} />
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px", marginBottom:"20px" }}>

                  {/* Quota Gauge */}
                  <div className="glass" style={{ padding:"28px" }}>
                    <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", marginBottom:"24px" }}>
                      Daily API Quota
                    </h3>
                    <div style={{ display:"flex", alignItems:"center", gap:"32px" }}>
                      <div style={{ position:"relative", flexShrink:0 }}>
                        <svg width="140" height="140" viewBox="0 0 140 140">
                          <circle cx="70" cy="70" r="54" fill="none" stroke="var(--border)" strokeWidth="12" />
                          <circle cx="70" cy="70" r="54"
                            fill="none"
                            stroke={d.quota_used >= d.quota_limit * 0.85 ? "var(--danger)" : "var(--primary)"}
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 54}`}
                            strokeDashoffset={`${2 * Math.PI * 54 * (1 - d.quota_used / d.quota_limit)}`}
                            transform="rotate(-90 70 70)"
                            style={{ transition:"stroke-dashoffset 1s ease" }}
                          />
                        </svg>
                        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"28px", fontWeight:"500", color:"var(--text-1)" }}>
                            {d.quota_used}
                          </span>
                          <span style={{ fontSize:"11px", color:"var(--text-3)" }}>of {d.quota_limit}</span>
                        </div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ marginBottom:"16px" }}>
                          <div style={{ fontSize:"12px", color:"var(--text-3)", marginBottom:"4px" }}>Docs processable today</div>
                          <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"20px", color:"var(--accent)" }}>
                            {d.docs_processable}
                          </div>
                        </div>
                        <div style={{ fontSize:"12px", color:"var(--text-3)", padding:"10px 12px", background:"var(--primary-glow)", borderRadius:"8px", border:"1px solid rgba(59,127,245,0.2)" }}>
                          Resets in <strong style={{ color:"var(--primary)" }}>~{d.resets_in_hours}h</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LLM Calls Per Doc */}
                  <div className="glass" style={{ padding:"28px" }}>
                    <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", marginBottom:"24px" }}>
                      LLM Calls Per Document
                    </h3>
                    {[
                      { stage:"Extraction Agent",   calls:1,     color:"var(--primary)",  note: undefined },
                      { stage:"Validation Agent",   calls:1,     color:"var(--accent)",   note: undefined },
                      { stage:"Re-extraction",      calls:"0–1", color:"var(--warning)",  note:"conditional" },
                      { stage:"Headnote Agent",     calls:1,     color:"var(--primary)",  note: undefined },
                      { stage:"Search Index Agent", calls:0,     color:"var(--text-3)",   note:"local only" },
                    ].map(({ stage, calls, color, note }) => (
                      <div key={stage} style={{ display:"flex", alignItems:"center", marginBottom:"14px", gap:"12px" }}>
                        <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:color, flexShrink:0 }} />
                        <span style={{ fontSize:"13px", color:"var(--text-1)", flex:1 }}>{stage}</span>
                        {note && <span style={{ fontSize:"10px", color:"var(--text-3)", background:"var(--bg)", padding:"2px 6px", borderRadius:"4px", border:"1px solid var(--border)" }}>{note}</span>}
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"14px", fontWeight:"500", color }}>{calls}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:"16px", paddingTop:"16px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:"13px", fontWeight:"600", color:"var(--text-1)" }}>Total per document</span>
                      <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"18px", fontWeight:"500", color:"var(--primary)" }}>
                        3–4 calls
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section Confidence */}
                <div className="glass" style={{ padding:"28px", marginBottom:"20px" }}>
                  <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", marginBottom:"24px" }}>
                    Extraction Confidence by Section
                  </h3>
                  <div style={{ display:"grid", gridTemplateColumns:`repeat(${d.section_confidence.length}, 1fr)`, gap:"16px" }}>
                    {d.section_confidence.map(({ label, confidence }) => {
                      const color = confColor(confidence);
                      const pct   = Math.round(confidence * 100);
                      return (
                        <div key={label} style={{ textAlign:"center" }}>
                          <div style={{ position:"relative", margin:"0 auto 10px", width:"64px", height:"64px" }}>
                            <svg width="64" height="64" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="24" fill="none" stroke="var(--border)" strokeWidth="6" />
                              <circle cx="32" cy="32" r="24"
                                fill="none" stroke={color} strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 24}`}
                                strokeDashoffset={`${2 * Math.PI * 24 * (1 - confidence)}`}
                                transform="rotate(-90 32 32)"
                              />
                            </svg>
                            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"12px", fontWeight:"500", color }}>
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize:"11px", color:"var(--text-2)", lineHeight:"1.3" }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Weekly Bar Chart */}
                <div className="glass" style={{ padding:"28px" }}>
                  <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"17px", marginBottom:"24px" }}>
                    Weekly API Usage
                  </h3>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:"12px", height:"120px" }}>
                    {d.daily_usage.map(({ day, calls }) => (
                      <div key={day} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"8px", height:"100%", justifyContent:"flex-end" }}>
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"11px", color:"var(--text-3)" }}>{calls}</span>
                        <div style={{
                          width:"100%",
                          height:`${(calls / maxCalls) * 80}px`,
                          background: calls >= d.quota_limit
                            ? "var(--danger)"
                            : calls >= d.quota_limit * 0.7
                            ? "linear-gradient(180deg, var(--warning), var(--primary))"
                            : "linear-gradient(180deg, var(--primary), var(--accent))",
                          borderRadius:"6px 6px 0 0", transition:"height 0.5s ease",
                          position:"relative", overflow:"hidden",
                        }}>
                          <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)" }} />
                          {/* Progress % label overlay */}
                          <div style={{
                            position:"absolute", bottom:"2px", left:0, right:0,
                            textAlign:"center", fontSize:"9px",
                            color:"rgba(255,255,255,0.7)",
                            fontFamily:"'JetBrains Mono', monospace",
                          }}>
                            {Math.round(calls / d.quota_limit * 100)}%
                          </div>
                        </div>
                        <span style={{ fontSize:"11px", color:"var(--text-3)" }}>{day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </main>
        </PageTransition>
      </div>
    </div>
  );
}
