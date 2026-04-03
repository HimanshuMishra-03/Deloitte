import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/globals.css";
import FloatingChat from "@/components/chatbot/FloatingChat";

export const metadata: Metadata = {
  title:       "LexAI — Indian Legal Intelligence",
  description: "Agentic AI for structured Indian case law intelligence",
};

// Runs before hydration — prevents theme flash
const themeScript = `
  (function(){
    try {
      var t = localStorage.getItem('lexai-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', t);
    } catch(e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Suspense>
          {children}
        </Suspense>
        <FloatingChat />
      </body>
    </html>
  );
}
