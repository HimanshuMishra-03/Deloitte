"use client";
import { Search, Bell, Upload } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";

interface NavbarProps {
  title?: string;
  onUpload?: () => void;
}

export default function Navbar({ title, onUpload }: NavbarProps) {
  return (
    <header style={{
      height:         "var(--navbar-h)",
      background:     "var(--bg-2)",
      borderBottom:   "1px solid var(--border)",
      display:        "flex",
      alignItems:     "center",
      padding:        "0 24px",
      gap:            "16px",
      position:       "sticky",
      top:            0,
      zIndex:         30,
      backdropFilter: "blur(12px)",
    }}>
      {/* Page title */}
      <h1 style={{
        fontFamily:    "'DM Serif Display', serif",
        fontSize:      "18px",
        fontWeight:    "400",
        color:         "var(--text-1)",
        flex:          1,
        letterSpacing: "-0.3px",
      }}>
        {title || "Dashboard"}
      </h1>

      {/* Quick search */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "8px",
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        borderRadius: "10px",
        padding:      "8px 14px",
        minWidth:     "200px",
        cursor:       "pointer",
        transition:   "var(--transition)",
      }}>
        <Search size={14} color="var(--text-3)" />
        <span style={{ fontSize: "13px", color: "var(--text-3)" }}>Quick search...</span>
        <span style={{
          marginLeft:   "auto",
          fontSize:     "11px",
          color:        "var(--text-3)",
          background:   "var(--bg)",
          padding:      "2px 6px",
          borderRadius: "4px",
          border:       "1px solid var(--border)",
        }}>⌘K</span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <ThemeToggle />

        <button className="btn-icon" style={{
          width:          "36px",
          height:         "36px",
          borderRadius:   "10px",
          background:     "var(--surface)",
          border:         "1px solid var(--border)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          cursor:         "pointer",
          position:       "relative",
          color:          "var(--text-2)",
          transition:     "var(--transition)",
        }}>
          <Bell size={16} />
          <div style={{
            position:     "absolute",
            top:          "8px",
            right:        "8px",
            width:        "6px",
            height:       "6px",
            borderRadius: "50%",
            background:   "var(--primary)",
          }} />
        </button>

        <button
          onClick={onUpload}
          className="btn-primary"
          style={{
            display:     "flex",
            alignItems:  "center",
            gap:         "8px",
            padding:     "8px 16px",
            background:  "var(--primary)",
            color:       "white",
            border:      "none",
            borderRadius:"10px",
            cursor:      "pointer",
            fontSize:    "13px",
            fontWeight:  "600",
            transition:  "var(--transition)",
            boxShadow:   "0 4px 12px var(--primary-glow)",
          }}>
          <Upload size={14} />
          Upload PDF
        </button>

        {/* Avatar */}
        <div style={{
          width:          "36px",
          height:         "36px",
          borderRadius:   "50%",
          background:     "linear-gradient(135deg, var(--primary), var(--accent))",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "12px",
          fontWeight:     "600",
          color:          "white",
          cursor:         "pointer",
          flexShrink:     0,
          boxShadow:      "0 2px 8px var(--primary-glow)",
        }}>
          HM
        </div>
      </div>
    </header>
  );
}
