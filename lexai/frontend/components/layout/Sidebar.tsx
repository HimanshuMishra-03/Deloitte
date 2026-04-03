"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Search, BarChart3, FileText,
  Scale, ChevronRight, BookOpen, Gavel,
  FileSearch, TrendingUp, Settings, HelpCircle,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/",          icon: LayoutDashboard },
  { label: "Search",     href: "/search",     icon: Search },
  { label: "Analytics",  href: "/analytics",  icon: BarChart3 },
];

const SECTION_ITEMS = [
  { label: "Facts",              icon: FileText,   key: "facts" },
  { label: "Petitioner Args",    icon: Scale,      key: "petitioner" },
  { label: "Respondent Args",    icon: Scale,      key: "respondent" },
  { label: "Sections of Law",    icon: BookOpen,   key: "law" },
  { label: "Precedents Cited",   icon: FileSearch, key: "precedents" },
  { label: "Court Reasoning",    icon: Gavel,      key: "reasoning" },
  { label: "Final Order",        icon: TrendingUp, key: "order" },
];

interface SidebarProps {
  activeCaseId?: string;
  onSectionClick?: (key: string) => void;
  activeSection?: string;
}

export default function Sidebar({ activeCaseId, onSectionClick, activeSection }: SidebarProps) {
  const pathname   = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside style={{
      width:       collapsed ? "72px" : "var(--sidebar-w)",
      minHeight:   "100vh",
      background:  "var(--bg-2)",
      borderRight: "1px solid var(--border)",
      display:     "flex",
      flexDirection: "column",
      transition:  "width 0.3s cubic-bezier(0.4,0,0.2,1)",
      position:    "sticky",
      top:         0,
      zIndex:      40,
      overflow:    "hidden",
      flexShrink:  0,
    }}>
      {/* Logo */}
      <div style={{
        padding:     "20px 16px",
        borderBottom:"1px solid var(--border)",
        display:     "flex",
        alignItems:  "center",
        gap:         "12px",
        minHeight:   "var(--navbar-h)",
      }}>
        <div style={{
          width:          "36px",
          height:         "36px",
          borderRadius:   "10px",
          background:     "linear-gradient(135deg, var(--primary), var(--accent))",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          boxShadow:      "0 4px 12px var(--primary-glow)",
        }}>
          <Scale size={18} color="white" />
        </div>
        {!collapsed && (
          <span style={{
            fontFamily:    "'DM Serif Display', serif",
            fontSize:      "18px",
            fontWeight:    "400",
            color:         "var(--text-1)",
            whiteSpace:    "nowrap",
            letterSpacing: "-0.3px",
          }}>
            LexAI
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn-icon"
          style={{
            marginLeft:   "auto",
            background:   "none",
            border:       "none",
            cursor:       "pointer",
            color:        "var(--text-3)",
            padding:      "4px",
            borderRadius: "6px",
            display:      "flex",
            transition:   "var(--transition)",
            flexShrink:   0,
          }}
        >
          <ChevronRight
            size={16}
            style={{
              transform:  collapsed ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.3s",
            }}
          />
        </button>
      </div>

      {/* Main Nav */}
      <nav style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
        <div style={{ marginBottom: "8px" }}>
          {!collapsed && (
            <span style={{
              fontSize:      "10px",
              fontWeight:    "600",
              letterSpacing: "1.2px",
              color:         "var(--text-3)",
              padding:       "0 8px",
              display:       "block",
              marginBottom:  "6px",
              textTransform: "uppercase",
            }}>
              Navigation
            </span>
          )}
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: "none" }}>
                <div
                  className="nav-item"
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    gap:            "10px",
                    padding:        "10px 10px",
                    borderRadius:   "10px",
                    marginBottom:   "2px",
                    background:     active ? "var(--primary-glow)" : "transparent",
                    color:          active ? "var(--primary)" : "var(--text-2)",
                    transition:     "var(--transition)",
                    cursor:         "pointer",
                    position:       "relative",
                    justifyContent: collapsed ? "center" : "flex-start",
                  }}>
                  {active && (
                    <div style={{
                      position:     "absolute",
                      left:         0,
                      top:          "20%",
                      bottom:       "20%",
                      width:        "3px",
                      borderRadius: "0 3px 3px 0",
                      background:   "var(--primary)",
                    }} />
                  )}
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  {!collapsed && (
                    <span style={{ fontSize: "14px", fontWeight: active ? 600 : 400 }}>
                      {label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Case Sections */}
        {activeCaseId && !collapsed && (
          <div style={{ marginTop: "20px" }}>
            <span style={{
              fontSize:      "10px",
              fontWeight:    "600",
              letterSpacing: "1.2px",
              color:         "var(--text-3)",
              padding:       "0 8px",
              display:       "block",
              marginBottom:  "6px",
              textTransform: "uppercase",
            }}>
              Case Sections
            </span>
            {SECTION_ITEMS.map(({ label, icon: Icon, key }) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => onSectionClick?.(key)}
                  className="nav-item-section"
                  style={{
                    width:       "100%",
                    display:     "flex",
                    alignItems:  "center",
                    gap:         "10px",
                    padding:     "9px 10px",
                    borderRadius:"10px",
                    marginBottom:"2px",
                    background:  active ? "var(--accent-glow)" : "transparent",
                    color:       active ? "var(--accent)" : "var(--text-2)",
                    border:      "none",
                    cursor:      "pointer",
                    transition:  "var(--transition)",
                    textAlign:   "left",
                  }}>
                  <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                  <span style={{ fontSize: "13px", fontWeight: active ? 600 : 400 }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div style={{
        padding:       "12px 8px",
        borderTop:     "1px solid var(--border)",
        display:       "flex",
        flexDirection: "column",
        gap:           "2px",
      }}>
        {[
          { icon: Settings,    label: "Settings" },
          { icon: HelpCircle,  label: "Help" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="nav-item"
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            "10px",
              padding:        "9px 10px",
              borderRadius:   "10px",
              color:          "var(--text-3)",
              cursor:         "pointer",
              transition:     "var(--transition)",
              justifyContent: collapsed ? "center" : "flex-start",
            }}>
            <Icon size={16} />
            {!collapsed && <span style={{ fontSize: "13px" }}>{label}</span>}
          </div>
        ))}
      </div>
    </aside>
  );
}
