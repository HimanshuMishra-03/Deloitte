"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar        from "@/components/layout/Sidebar";
import Navbar         from "@/components/layout/Navbar";
import PageTransition from "@/components/layout/PageTransition";
import { apiGet } from "@/lib/api";
import { PageLoadingOverlay } from "@/components/ui/LoadingSpinner";
import { AlertCircle } from "lucide-react";

// Map section keys to actual database column names
const SECTIONS = [
  { key: "main_issue",        label: "Facts & Background" },
  { key: "petitioner_args",   label: "Petitioner Arguments" },
  { key: "respondent_args",   label: "Respondent Arguments" },
  { key: "sections_of_law",   label: "Sections of Law" },
  { key: "precedents_cited",  label: "Precedents Cited" },
  { key: "court_reasoning",   label: "Court Reasoning" },
  { key: "final_decision",    label: "Final Order" },
];

// Validation detail uses these keys
const CONF_KEY: Record<string, string> = {
  main_issue:        "facts",
  petitioner_args:   "petitioner_args",
  respondent_args:   "respondent_args",
  sections_of_law:   "sections_of_law",
  precedents_cited:  "precedents_cited",
  court_reasoning:   "court_reasoning",
  final_decision:    "final_decision",
};

interface CaseDetail {
  id:                   string;
  file_name:            string;
  case_title?:          string;
  court_and_date?:      string;
  outcome?:             string;
  overall_confidence?:  number;
  headnote?:            string;
  main_issue?:          string;
  petitioner_args?:     string[] | string;
  respondent_args?:     string[] | string;
  sections_of_law?:     string[] | string;
  precedents_cited?:    string[] | string;
  court_reasoning?:     string;
  final_decision?:      string;
  validation_detail?:   Record<string, { confidence: number; flagged: boolean }>;
  keywords?:            string[];
  practice_area?:       string[];
}

/** Extract displayable text from a field that may be string, array, or null. */
function extractSectionText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const joined = value
      .map((v, i) => typeof v === "string" ? `${i + 1}. ${v}` : String(v))
      .join("\n\n");
    return joined.trim() || undefined;
  }
  return undefined;
}

function outcomeColor(o?: string) {
  if (!o) return "var(--text-3)";
  if (o.includes("allow") || o.includes("acquit")) return "var(--accent)";
  if (o.includes("dismiss") || o.includes("convict")) return "var(--danger)";
  return "var(--warning)";
}
function confColor(c: number) {
  return c > 0.85 ? "var(--accent)" : c > 0.7 ? "var(--warning)" : "var(--danger)";
}

export default function CasePage() {
  const { id }                     = useParams<{ id: string }>();
  const router                     = useRouter();
  const [data,   setData]          = useState<CaseDetail | null>(null);
  const [loading, setLoading]      = useState(true);
  const [error,  setError]         = useState(false);
  const [section, setSection]      = useState(SECTIONS[0].key);

  useEffect(() => {
    if (!id) return;
    apiGet<CaseDetail>(`/api/cases/${id}`)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    // Pre-load chatbot context IN PARALLEL — don't await
    // This warms the case cache so first chatbot question is fast
    fetch(`/api/rag/preload/${id}`, { method: "POST" })
      .catch(() => {}); // silent fail — chatbot still works without it

  }, [id]);

  const activeConf = data?.validation_detail?.[CONF_KEY[section]]?.confidence;
  const rawValue = data ? (data as unknown as Record<string, unknown>)[section] : undefined;
  const sectionText = extractSectionText(rawValue);

  return (
    <div style={{ display:"flex", minHeight:"100vh" }}>
      <Sidebar />
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative" }}>
        <Navbar title={data?.case_title?.slice(0, 55) || "Case Detail"} />

        {loading && <PageLoadingOverlay message="Loading judgment…" />}

        {!loading && error && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"16px" }}>
            <AlertCircle size={40} color="var(--danger)" />
            <p style={{ color:"var(--text-2)", fontSize:"15px" }}>Case not found</p>
            <button
              onClick={() => router.push("/")}
              style={{ padding:"8px 20px", background:"var(--primary)", color:"white", border:"none", borderRadius:"8px", cursor:"pointer" }}>
              Go to Dashboard
            </button>
          </div>
        )}

        {!loading && data && (
          <PageTransition>
            <main style={{ flex:1, padding:"28px", overflowY:"auto" }}>

              {/* Case header card */}
              <div className="glass" style={{ padding:"24px", marginBottom:"20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"20px", marginBottom:"14px" }}>
                  <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"21px", fontWeight:"400", lineHeight:"1.4", color:"var(--text-1)", flex:1 }}>
                    {data.case_title || data.file_name}
                  </h2>
                  {data.overall_confidence != null && (
                    <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"22px", fontWeight:"500", color:confColor(data.overall_confidence), flexShrink:0 }}>
                      {Math.round(data.overall_confidence * 100)}%
                    </div>
                  )}
                </div>

                <div style={{ display:"flex", gap:"16px", fontSize:"13px", color:"var(--text-2)", flexWrap:"wrap", marginBottom:data.headnote ? "16px" : "0" }}>
                  {data.court_and_date && <span>{data.court_and_date}</span>}
                  {data.outcome && (
                    <span style={{ color:outcomeColor(data.outcome), fontWeight:"600", textTransform:"capitalize" }}>
                      {data.outcome}
                    </span>
                  )}
                  {(data.practice_area || []).map(p => (
                    <span key={p} style={{ background:"var(--primary-glow)", color:"var(--primary)", padding:"2px 8px", borderRadius:"4px", fontSize:"11px", fontWeight:"500" }}>
                      {p}
                    </span>
                  ))}
                </div>

                {data.headnote && (
                  <div style={{ padding:"14px 16px", background:"var(--bg)", borderRadius:"10px", borderLeft:"3px solid var(--primary)", fontSize:"13px", lineHeight:"1.8", color:"var(--text-1)" }}>
                    {data.headnote}
                  </div>
                )}

                {(data.keywords || []).length > 0 && (
                  <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginTop:"14px" }}>
                    {(data.keywords || []).slice(0, 8).map(k => (
                      <span key={k} style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"4px", background:"rgba(0,212,170,0.08)", color:"var(--accent)", border:"1px solid rgba(0,212,170,0.2)" }}>
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Two-column: section nav + content */}
              <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:"16px" }}>

                {/* Section navigation */}
                <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                  {SECTIONS.map(s => {
                    const conf = data.validation_detail?.[CONF_KEY[s.key]]?.confidence;
                    const active = section === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setSection(s.key)}
                        style={{
                          textAlign:    "left",
                          padding:      "10px 14px",
                          borderRadius: "10px",
                          border:       `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                          background:   active ? "var(--primary-glow)" : "var(--surface)",
                          color:        active ? "var(--primary)" : "var(--text-2)",
                          fontSize:     "12px",
                          fontWeight:   active ? "600" : "400",
                          cursor:       "pointer",
                          transition:   "var(--transition)",
                          display:      "flex",
                          justifyContent:"space-between",
                          alignItems:   "center",
                          gap:          "8px",
                        }}
                      >
                        <span style={{ flex:1 }}>{s.label}</span>
                        {conf !== undefined && (
                          <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"10px", color:confColor(conf), flexShrink:0 }}>
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Section content */}
                <div className="glass" style={{ padding:"28px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                    <h3 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"18px", fontWeight:"400" }}>
                      {SECTIONS.find(s => s.key === section)?.label}
                    </h3>
                    {activeConf !== undefined && (
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 12px", background:"var(--bg)", borderRadius:"8px", border:"1px solid var(--border)" }}>
                        <span style={{ fontSize:"12px", color:"var(--text-3)" }}>Confidence</span>
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"13px", fontWeight:"500", color:confColor(activeConf) }}>
                          {Math.round(activeConf * 100)}%
                        </span>
                        {/* Inline progress bar */}
                        <div style={{ width:"60px", height:"4px", background:"var(--border)", borderRadius:"2px", overflow:"hidden" }}>
                          <div style={{ width:`${activeConf * 100}%`, height:"100%", background:confColor(activeConf), borderRadius:"2px", transition:"width 0.4s ease" }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {sectionText ? (
                    <div style={{ fontFamily:"Georgia, 'Times New Roman', serif", fontSize:"14px", lineHeight:"1.9", color:"var(--text-1)", whiteSpace:"pre-wrap", maxHeight:"65vh", overflowY:"auto" }}>
                      {sectionText}
                    </div>
                  ) : (
                    <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--text-3)", fontSize:"14px" }}>
                      This section was not found in the judgment.
                    </div>
                  )}
                </div>

              </div>
            </main>
          </PageTransition>
        )}
      </div>
    </div>
  );
}
