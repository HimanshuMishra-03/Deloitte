"use client";
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ section: string; excerpt: string; score: number }>;
  streaming?: boolean;
}

export default function CaseChat({ caseId }: { caseId: string }) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const bottomRef                  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setLoading(true);

    // Add user message
    setMessages(prev => [...prev, { role: "user", content: question }]);

    // Add empty assistant message that will be filled by streaming
    setMessages(prev => [...prev, {
      role: "assistant", content: "", streaming: true
    }]);

    try {
      const history = messages.map(m => ({
        role: m.role, content: m.content
      }));

      const res = await fetch("http://localhost:8000/api/rag/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, case_id: caseId, history }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE lines
        const lines = buffer.split("\n\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          try {
            const data = JSON.parse(line.slice(6));

            if (data.token) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  // Important: mutate a COPY of the message to trigger re-renders properly
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + data.token
                  };
                }
                return updated;
              });
            }

            if (data.done) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    streaming: false,
                    sources: data.sources
                  };
                }
                return updated;
              });
            }

            if (data.error) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: `Error: ${data.error}`,
                    streaming: false
                  };
                }
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant") {
          last.content  = "Connection error. Please try again.";
          last.streaming = false;
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[600px] border rounded-lg bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-blue-50">
        <h3 className="font-semibold text-blue-900">Ask this Judgment</h3>
        <p className="text-xs text-blue-600">Powered by Qwen2.5 · Offline · Zero API cost</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>Ask any question about this judgment</p>
            <div className="mt-4 space-y-2">
              {[
                "What was the main legal issue?",
                "What did the petitioner argue?",
                "What sections of law were applied?",
                "What was the final decision?",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left px-3 py-2 text-sm bg-gray-50
                             hover:bg-blue-50 hover:text-blue-700 rounded border
                             transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-800"
            }`}>
              <p className="whitespace-pre-wrap">
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-2 h-4 bg-gray-500 ml-1 animate-pulse" />
                )}
              </p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 space-y-1">
                  <p className="text-xs font-semibold text-gray-500">Sources</p>
                  {msg.sources.map((s, si) => (
                    <div key={si} className="text-xs text-gray-500 bg-white rounded p-2">
                      <span className="font-medium">{s.section.toUpperCase()}</span>
                      <span className="ml-2 text-gray-400">score: {s.score}</span>
                      <p className="mt-1 line-clamp-2">{s.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask a question about this case..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none
                     focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
