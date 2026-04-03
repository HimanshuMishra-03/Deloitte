"use client";
import { useEffect, useRef, ReactNode } from "react";

/** Wraps a page in a simple fade+slide-up animation on mount. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Start invisible
    el.style.opacity   = "0";
    el.style.transform = "translateY(12px)";
    // Animate in on next frame
    const id = requestAnimationFrame(() => {
      el.style.transition = "opacity 0.35s ease, transform 0.35s ease";
      el.style.opacity    = "1";
      el.style.transform  = "translateY(0)";
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/** Full-screen loading overlay with animated logo + progress bar. */
export function PageLoader({ message = "Processing..." }: { message?: string }) {
  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      background:     "var(--bg)",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      zIndex:         100,
      gap:            "20px",
    }}>
      <div style={{
        width:          "52px",
        height:         "52px",
        borderRadius:   "14px",
        background:     "linear-gradient(135deg, var(--primary), var(--accent))",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        boxShadow:      "0 8px 32px var(--primary-glow)",
        animation:      "float 2s ease-in-out infinite",
      }}>
        <span style={{ color: "white", fontSize: "22px" }}>⚖</span>
      </div>
      <div style={{
        width:        "180px",
        height:       "3px",
        background:   "var(--border)",
        borderRadius: "2px",
        overflow:     "hidden",
      }}>
        <div style={{
          height:          "100%",
          background:      "linear-gradient(90deg, var(--primary), var(--accent))",
          backgroundSize:  "200% 100%",
          animation:       "shimmer 1.4s infinite",
        }} />
      </div>
      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>{message}</p>
    </div>
  );
}
