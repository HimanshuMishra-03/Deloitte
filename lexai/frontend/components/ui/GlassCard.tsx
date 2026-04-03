import { CSSProperties, ReactNode } from "react";

interface GlassCardProps {
  children:   ReactNode;
  style?:     CSSProperties;
  className?: string;
  onClick?:   () => void;
}

export default function GlassCard({ children, style, className, onClick }: GlassCardProps) {
  return (
    <div
      className={`glass ${className || ""}`}
      onClick={onClick}
      style={{
        padding: "24px",
        cursor:  onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
