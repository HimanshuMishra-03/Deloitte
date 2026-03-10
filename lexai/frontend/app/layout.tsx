import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexAI — Indian Case Law Intelligence',
  description: 'Agentic AI system for structured extraction and semantic search of Indian legal judgments',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink-900 text-parchment antialiased min-h-screen">
        {/* Top bar */}
        <header className="border-b border-white/[0.06] sticky top-0 z-50 backdrop-blur-md bg-ink-900/80">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center">
                <span className="text-gold font-serif font-bold text-sm">⚖</span>
              </div>
              <span className="font-serif text-xl text-parchment group-hover:text-gold transition-colors">
                Lex<span className="text-gold">AI</span>
              </span>
            </a>
            <nav className="flex items-center gap-6">
              <a href="/" className="font-mono text-xs text-ink-100/50 hover:text-parchment transition-colors uppercase tracking-widest">Upload</a>
              <a href="/search" className="font-mono text-xs text-ink-100/50 hover:text-parchment transition-colors uppercase tracking-widest">Search</a>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
