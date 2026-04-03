"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X, Send, ChevronDown } from "lucide-react";
import { streamChat } from "@/lib/api";

interface Message {
  role:      "user" | "assistant";
  content:   string;
  streaming?: boolean;
  failed?:   boolean;
}

const SUGGESTIONS: Record<string, string[]> = {
  dashboard: [
    "How does the processing pipeline work?",
    "Find common legal issues across all my cases",
    "What do confidence scores mean?",
    "How many cases have I processed?",
  ],
  analytics: [
    "What does the quota gauge show?",
    "How are section confidence scores calculated?",
    "How many Gemini calls does each document use?",
    "Why is my confidence score low?",
  ],
  search: [
    "How does semantic search work?",
    "Find cases involving Section 420 IPC",
    "Search for property partition disputes",
    "How do I filter by outcome?",
  ],
  case: [
    "What was the main legal issue?",
    "What did the petitioner argue?",
    "What precedents were cited?",
    "What was the final order of the court?",
  ],
};

// Parse **bold** markdown inline
function renderMd(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : p
  );
}

export default function FloatingChat() {
  const pathname = usePathname();
  const [open,  setOpen]  = useState(false);
  const [mini,  setMini]  = useState(false);
  const [input, setInput] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [msgs, setMsgs]   = useState<Message[]>([{
    role:    "assistant",
    content: "Hi! I'm **Lexi**, your LexAI legal research assistant 👩‍⚖️\n\nAsk me about your uploaded judgments, find patterns across all your cases, or ask how LexAI works. I'm here to help!",
  }]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const lastQ     = useRef<string>("");

  const page   = pathname?.startsWith("/case/")      ? "case"
               : pathname?.startsWith("/analytics")  ? "analytics"
               : pathname?.startsWith("/search")     ? "search"
               : "dashboard";

  const caseId = pathname?.startsWith("/case/")
    ? pathname.split("/case/")[1] : undefined;

  const chips = SUGGESTIONS[page] || SUGGESTIONS.dashboard;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (open && !mini) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, mini]);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    lastQ.current = q;
    setInput("");
    setBusy(true);

    // Abort previous
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const history = msgs
      .filter(m => !m.streaming && !m.failed)
      .map(m => ({ role: m.role, content: m.content }));

    setMsgs(p => [
      ...p,
      { role: "user",      content: q },
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      let liveCtx = {};
      try {
        const r = await fetch("/api/analytics/summary");
        if (r.ok) liveCtx = await r.json();
      } catch { /* optional */ }

      for await (const ev of streamChat(q, caseId, history, page, liveCtx, controller.signal)) {
        if (ev.token) {
          setMsgs(p => {
            const u = [...p];
            const l = u[u.length - 1];
            if (l.role === "assistant") l.content += ev.token;
            return u;
          });
        }
        if (ev.done || ev.error) {
          setMsgs(p => {
            const u = [...p];
            const l = u[u.length - 1];
            if (l.role === "assistant") {
              l.streaming = false;
              if (ev.error) {
                l.content = "Hmm, something went wrong. Could you try again? 🙏";
                l.failed  = true;
              }
            }
            return u;
          });
        }
      }

      // Finalise streaming
      setMsgs(p => {
        const u = [...p];
        const l = u[u.length - 1];
        if (l.role === "assistant" && l.streaming) l.streaming = false;
        return u;
      });

    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setMsgs(p => {
        const u = [...p];
        const l = u[u.length - 1];
        if (l.role === "assistant") {
          l.content   = isAbort
            ? "Request timed out after 2 minutes. The model may be loading for the first time."
            : "I lost connection to the backend. Please make sure the server is running! 🔌";
          l.streaming = false;
          l.failed    = true;
        }
        return u;
      });
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setBusy(false);
    }
  };

  const retry = () => {
    // Remove last failed pair and resend
    setMsgs(p => p.filter(m => !m.failed));
    send(lastQ.current);
  };

  return (
    <>
      {/* Floating bitmoji button */}
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position: "fixed", bottom: 28, right: 28,
          width: 64, height: 64, borderRadius: "50%",
          border: "3px solid var(--primary, #3B7FF5)",
          background: "var(--surface, #131929)",
          cursor: "pointer", zIndex: 1000,
          padding: 0, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(59,127,245,0.35)",
          transition: "transform 0.2s ease",
        }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          title="Ask Lexi"
        >
          <span style={{ fontSize: 30, lineHeight: "58px", display: "block", textAlign: "center" }}>👩‍⚖️</span>
          <div style={{
            position: "absolute", bottom: 3, right: 3,
            width: 12, height: 12, borderRadius: "50%",
            background: "#22c55e", border: "2px solid var(--surface, #131929)",
          }} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 28, right: 28,
          width: 400, height: mini ? 72 : 570,
          background: "var(--surface, #131929)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          borderRadius: 20,
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          zIndex: 1000, overflow: "hidden",
          transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}>

          {/* Header */}
          <div
            onClick={() => setMini(!mini)}
            style={{
              padding: "12px 14px",
              background: "linear-gradient(135deg, #1e3a8a 0%, #0c4a6e 100%)",
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", flexShrink: 0,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Avatar in header */}
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)",
              overflow: "hidden", flexShrink: 0,
              background: "rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 22 }}>👩‍⚖️</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "white", letterSpacing: "0.01em" }}>
                Lexi
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
                {page === "case" ? "Case context loaded · Offline" : "All cases · Offline"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={e => { e.stopPropagation(); setMini(!mini); }}
                style={{ background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", borderRadius: 8, padding: "5px 7px", color: "white" }}
              >
                <ChevronDown size={13} style={{ transform: mini ? "rotate(180deg)" : "none", transition: "0.3s", display: "block" }} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false); }}
                style={{ background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", borderRadius: 8, padding: "5px 7px", color: "white" }}
              >
                <X size={13} style={{ display: "block" }} />
              </button>
            </div>
          </div>

          {!mini && (
            <>
              {/* Messages */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "14px 14px 8px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {msgs.map((m, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "flex-end",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    {m.role === "assistant" && (
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        border: "1.5px solid rgba(59,127,245,0.5)",
                        overflow: "hidden", flexShrink: 0,
                        background: "rgba(59,127,245,0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 14 }}>👩‍⚖️</span>
                      </div>
                    )}

                    <div style={{
                      maxWidth: "78%",
                      padding: "9px 13px",
                      borderRadius: m.role === "user"
                        ? "14px 14px 3px 14px"
                        : "14px 14px 14px 3px",
                      background: m.role === "user"
                        ? "var(--primary, #3B7FF5)"
                        : "var(--bg, #0A0F1E)",
                      color: m.role === "user" ? "white" : "var(--text-1, #E2E8F0)",
                      fontSize: 13,
                      lineHeight: 1.65,
                      border: m.role === "assistant"
                        ? "1px solid var(--border, rgba(255,255,255,0.08))"
                        : "none",
                      whiteSpace: "pre-wrap",
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {m.content ? renderMd(m.content) : (m.streaming && "…")}
                      {m.streaming && (
                        <span style={{
                          display: "inline-block", width: 7, height: 13,
                          background: "var(--primary, #3B7FF5)",
                          marginLeft: 2, borderRadius: 2,
                          animation: "blink 0.7s step-end infinite",
                          verticalAlign: "text-bottom",
                        }} />
                      )}
                      {m.failed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); retry(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            marginTop: 10, padding: "6px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--primary, #3B7FF5)",
                            background: "rgba(59,127,245,0.1)",
                            color: "var(--primary, #3B7FF5)",
                            fontSize: 12, fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          ↻ Try again
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Suggestion chips — only on first message */}
                {msgs.length === 1 && (
                  <div style={{ paddingLeft: 34, display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                    <p style={{ fontSize: 11, color: "var(--text-3, #64748B)", margin: 0 }}>Try asking:</p>
                    {chips.map(c => (
                      <button key={c} onClick={() => send(c)} style={{
                        textAlign: "left",
                        background: "var(--surface, #131929)",
                        border: "1px solid var(--border, rgba(255,255,255,0.08))",
                        borderRadius: 8, padding: "7px 11px",
                        fontSize: 12, color: "var(--text-2, #94A3B8)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, color 0.15s",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary, #3B7FF5)"; e.currentTarget.style.color = "var(--text-1, #E2E8F0)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border, rgba(255,255,255,0.08))"; e.currentTarget.style.color = "var(--text-2, #94A3B8)"; }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div style={{
                padding: "10px 12px", borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
                display: "flex", gap: 8, flexShrink: 0,
              }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Ask Lexi anything..."
                  disabled={busy}
                  style={{
                    flex: 1, border: "1px solid var(--border, rgba(255,255,255,0.08))",
                    borderRadius: 10, padding: "9px 13px", fontSize: 13,
                    background: "var(--bg, #0A0F1E)", color: "var(--text-1, #E2E8F0)",
                    outline: "none", fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--primary, #3B7FF5)"}
                  onBlur={e  => e.target.style.borderColor = "var(--border, rgba(255,255,255,0.08))"}
                />
                <button onClick={() => send()} disabled={busy || !input.trim()} style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: busy || !input.trim() ? "rgba(59,127,245,0.3)" : "var(--primary, #3B7FF5)",
                  border: "none", cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}>
                  {busy
                    ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    : <Send size={14} color="white" />
                  }
                </button>
              </div>

              {/* CSS keyframes injected once */}
              <style>{`
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
                @keyframes spin  { to { transform: rotate(360deg) } }
              `}</style>
            </>
          )}
        </div>
      )}
    </>
  );
}
