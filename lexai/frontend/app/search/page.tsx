"use client";
import { useState, useCallback } from "react";
import Sidebar        from "@/components/layout/Sidebar";
import Navbar         from "@/components/layout/Navbar";
import PageTransition from "@/components/layout/PageTransition";
import { Search, FileText, ArrowRight, X, Mic } from "lucide-react";
import { apiGet, voiceRagQuery } from "@/lib/api";

const OUTCOMES = ["All", "Allowed", "Dismissed", "Partly Allowed", "Quashed", "Remanded"];

interface SearchResult {
  id:                 string;
  file_name?:         string;
  case_title?:        string;
  court_and_date?:    string;
  outcome?:           string;
  overall_confidence?:number;
  short_summary?:     string;
  keywords?:          string[];
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

export default function SearchPage() {
  const [query,     setQuery]     = useState("");
  const [outcome,   setOutcome]   = useState("All");
  const [results,   setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched,  setSearched]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const doSearch = useCallback(async (q: string, out = "All") => {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    setSearched(false);
    try {
      const params = new URLSearchParams({ q });
      if (out !== "All") params.set("outcome", out.toLowerCase());
      const data = await apiGet<SearchResult[] | { results?: SearchResult[] }>(`/api/search?${params}`);
      const list = Array.isArray(data) ? data : (data as { results?: SearchResult[] }).results || [];
      setResults(list);
      setSearched(true);
    } catch {
      setError("Search failed. Is the backend running?");
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = () => doSearch(query, outcome);

  const handleVoice = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        try {
          const resp = await voiceRagQuery(blob);
          const transcribed = resp.transcribed_query;
          if (transcribed) {
            setQuery(transcribed);
            await doSearch(transcribed, outcome);
          }
        } catch { setError("Voice recognition failed."); }
        setRecording(false);
      };
      recorder.start();
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
    } catch {
      setError("Microphone access denied.");
      setRecording(false);
    }
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh" }}>
      <Sidebar />
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <Navbar title="Search" />
        <PageTransition>
          <main style={{ flex:1, padding:"28px", maxWidth:"900px", margin:"0 auto", width:"100%" }}>

            {/* Hero */}
            <div style={{ textAlign:"center", marginBottom:"40px", paddingTop:"24px" }}>
              <h2 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"32px", fontWeight:"400", color:"var(--text-1)", marginBottom:"10px", letterSpacing:"-0.5px" }}>
                Search Indian Judgments
              </h2>
              <p style={{ color:"var(--text-2)", fontSize:"15px", marginBottom:"28px" }}>
                Semantic search across all indexed cases
              </p>

              {/* Search bar */}
              <div style={{ display:"flex", alignItems:"center", background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:"14px", padding:"6px 6px 6px 20px", boxShadow:"var(--shadow-lg)", gap:"4px" }}>
                <Search size={18} color="var(--text-3)" style={{ flexShrink:0 }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="e.g. property rights after partition, bail conditions, Section 420 IPC…"
                  style={{ flex:1, border:"none", outline:"none", background:"transparent", padding:"10px 14px", fontSize:"15px", color:"var(--text-1)", fontFamily:"'DM Sans', sans-serif" }}
                />
                {query && (
                  <button onClick={() => { setQuery(""); setSearched(false); setResults([]); }} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", padding:"4px" }}>
                    <X size={16} />
                  </button>
                )}
                <button
                  onClick={handleVoice}
                  title="Voice search (5s)"
                  style={{
                    background: recording ? "rgba(239,68,68,0.15)" : "var(--bg)",
                    border: `1px solid ${recording ? "var(--danger)" : "var(--border)"}`,
                    borderRadius:"8px", padding:"8px", cursor:"pointer",
                    color: recording ? "var(--danger)" : "var(--text-2)",
                    display:"flex", marginRight:"4px", transition:"var(--transition)",
                    animation: recording ? "pulse-glow 0.8s infinite" : "none",
                  }}>
                  <Mic size={16} />
                </button>
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  style={{ padding:"10px 24px", background:"var(--primary)", color:"white", border:"none", borderRadius:"10px", cursor:searching?"not-allowed":"pointer", fontSize:"14px", fontWeight:"600", transition:"var(--transition)", whiteSpace:"nowrap", boxShadow:"0 4px 12px var(--primary-glow)", opacity:searching?0.7:1 }}>
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>

              {/* Outcome pills */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", marginTop:"14px", flexWrap:"wrap" }}>
                {OUTCOMES.map(o => (
                  <button
                    key={o}
                    onClick={() => { setOutcome(o); if (query) doSearch(query, o); }}
                    style={{
                      padding:"5px 14px", borderRadius:"20px",
                      border:`1px solid ${outcome === o ? "var(--primary)" : "var(--border)"}`,
                      background: outcome === o ? "var(--primary-glow)" : "var(--surface)",
                      color: outcome === o ? "var(--primary)" : "var(--text-2)",
                      fontSize:"12px", fontWeight: outcome === o ? "600" : "400",
                      cursor:"pointer", transition:"var(--transition)",
                    }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading */}
            {searching && (
              <div style={{ textAlign:"center", padding:"40px" }}>
                <div style={{ width:"36px", height:"36px", border:"3px solid var(--border)", borderTop:"3px solid var(--primary)", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
                <p style={{ color:"var(--text-2)", fontSize:"14px" }}>Searching indexed judgments…</p>
              </div>
            )}

            {/* Error */}
            {error && !searching && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:"12px", padding:"16px 20px", color:"var(--danger)", fontSize:"13px", marginBottom:"20px" }}>
                ⚠ {error}
              </div>
            )}

            {/* Results */}
            {!searching && searched && (
              <div>
                <p style={{ fontSize:"13px", color:"var(--text-3)", marginBottom:"16px" }}>
                  {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
                </p>
                {results.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--text-3)" }}>
                    <div style={{ fontSize:"48px", marginBottom:"16px" }}>⚖</div>
                    <p style={{ fontFamily:"'DM Serif Display', serif", fontSize:"18px", color:"var(--text-2)", marginBottom:"8px" }}>No results found</p>
                    <p style={{ fontSize:"13px" }}>Try different keywords or remove filters</p>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                    {results.map(r => (
                      <a key={r.id} href={`/case/${r.id}`} style={{ textDecoration:"none" }}>
                        <div className="glass result-card" style={{ padding:"24px", cursor:"pointer", transition:"var(--transition)" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"12px" }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <h4 style={{ fontFamily:"'DM Serif Display', serif", fontSize:"16px", fontWeight:"400", color:"var(--text-1)", marginBottom:"6px", lineHeight:"1.4" }}>
                                {r.case_title || r.file_name || `Case ${r.id}`}
                              </h4>
                              <div style={{ display:"flex", gap:"12px", fontSize:"12px", color:"var(--text-3)", flexWrap:"wrap" }}>
                                {r.court_and_date && <span>{r.court_and_date}</span>}
                                {r.outcome && (
                                  <><span>·</span><span style={{ color:outcomeColor(r.outcome), fontWeight:"500", textTransform:"capitalize" }}>{r.outcome}</span></>
                                )}
                              </div>
                            </div>
                            {r.overall_confidence != null && (
                              <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"13px", fontWeight:"500", color:confColor(r.overall_confidence), background:"var(--bg)", padding:"4px 10px", borderRadius:"6px", border:"1px solid var(--border)", flexShrink:0, marginLeft:"16px" }}>
                                {Math.round(r.overall_confidence * 100)}%
                              </div>
                            )}
                          </div>
                          {r.short_summary && (
                            <p style={{ fontSize:"13px", color:"var(--text-2)", lineHeight:"1.6", marginBottom:"14px" }}>
                              {r.short_summary}
                            </p>
                          )}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                              {(r.keywords || []).slice(0, 4).map(tag => (
                                <span key={tag} style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"4px", background:"var(--primary-glow)", color:"var(--primary)", border:"1px solid rgba(59,127,245,0.2)" }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <span style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"12px", color:"var(--primary)", fontWeight:"500" }}>
                              View case <ArrowRight size={12} />
                            </span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!searching && !searched && (
              <div style={{ textAlign:"center", paddingTop:"40px", color:"var(--text-3)" }}>
                <FileText size={48} style={{ margin:"0 auto 16px", opacity:0.3 }} />
                <p style={{ fontFamily:"'DM Serif Display', serif", fontSize:"18px", color:"var(--text-2)", marginBottom:"8px" }}>Enter a query above</p>
                <p style={{ fontSize:"13px" }}>Search by case name, legal provision, or legal issue</p>
              </div>
            )}

          </main>
        </PageTransition>
      </div>
    </div>
  );
}
