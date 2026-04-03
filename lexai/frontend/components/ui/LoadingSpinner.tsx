// components/ui/LoadingSpinner.tsx

export default function LoadingSpinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width:        size,
      height:       size,
      border:       "3px solid var(--border)",
      borderTop:    "3px solid var(--primary)",
      borderRadius: "50%",
      animation:    "spin 0.8s linear infinite",
      margin:       "0 auto",
    }} />
  );
}

export function SkeletonLine({ width = "100%", height = 16 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: "6px", marginBottom: "8px" }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass" style={{ padding: "20px" }}>
      <SkeletonLine width="60%" height={20} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "40%" : "100%"} />
      ))}
    </div>
  );
}

export function PageLoadingOverlay({ message = "Loading..." }: { message?: string }) {
  return (
    <div style={{
      position:       "absolute",
      inset:          0,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            "16px",
      background:     "var(--bg)",
      zIndex:         50,
    }}>
      <LoadingSpinner size={40} />
      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>{message}</p>
    </div>
  );
}
