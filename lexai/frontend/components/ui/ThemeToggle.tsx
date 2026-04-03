"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { getStoredTheme, applyTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="btn-icon"
      style={{
        width:          "36px",
        height:         "36px",
        borderRadius:   "10px",
        background:     "var(--surface)",
        border:         "1px solid var(--border)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         "pointer",
        color:          "var(--text-2)",
        transition:     "var(--transition)",
      }}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
