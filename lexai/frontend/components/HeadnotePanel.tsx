'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { CaseRecord } from '@/lib/types';

const OUTCOME_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  acquitted: { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-400', label: 'ACQUITTED' },
  convicted: { bg: 'bg-red-500/20 border-red-500/40',       text: 'text-red-400',     label: 'CONVICTED' },
  remanded:  { bg: 'bg-blue-500/20 border-blue-500/40',      text: 'text-blue-400',    label: 'REMANDED' },
  modified:  { bg: 'bg-amber-500/20 border-amber-500/40',    text: 'text-amber-400',   label: 'MODIFIED' },
  dismissed: { bg: 'bg-gray-500/20 border-gray-500/40',      text: 'text-gray-400',    label: 'DISMISSED' },
};

export default function HeadnotePanel({ caseData }: { caseData: CaseRecord }) {
  const router = useRouter();
  const outcome = caseData.outcome || 'dismissed';
  const os = OUTCOME_STYLES[outcome] || OUTCOME_STYLES.dismissed;

  const handleKeywordClick = (kw: string) => {
    router.push(`/search?q=${encodeURIComponent(kw)}`);
  };
  const handleSectionClick = (sec: string) => {
    router.push(`/search?q=${encodeURIComponent(sec)}`);
  };
  const handlePrecedentClick = (p: string) => {
    router.push(`/search?q=${encodeURIComponent(p)}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Outcome badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-2 ${os.bg} border rounded-2xl px-5 py-3 self-start`}
      >
        <div className={`w-2 h-2 rounded-full ${os.text.replace('text-', 'bg-')}`} />
        <span className={`font-mono font-bold text-sm tracking-widest ${os.text}`}>{os.label}</span>
      </motion.div>

      {/* Headnote card */}
      {caseData.headnote && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gold/5 border border-gold/25 rounded-2xl p-6"
        >
          <p className="text-[10px] font-mono text-gold/60 uppercase tracking-widest mb-3">SCC Headnote</p>
          <p className="font-serif text-parchment/90 text-sm leading-relaxed">{caseData.headnote}</p>
        </motion.div>
      )}

      {/* Summary */}
      {caseData.short_summary && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <p className="text-[10px] font-mono text-ink-100/40 uppercase tracking-widest mb-2">Summary</p>
          <p className="text-ink-100/80 text-sm leading-relaxed">{caseData.short_summary}</p>
        </div>
      )}

      {/* Judges */}
      {caseData.coram_judges && caseData.coram_judges.length > 0 && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <p className="text-[10px] font-mono text-ink-100/40 uppercase tracking-widest mb-2">Coram</p>
          <div className="flex flex-wrap gap-2">
            {caseData.coram_judges.map((j, i) => (
              <span key={i} className="text-xs font-mono text-ink-100/70 bg-white/5 border border-white/10 rounded px-2 py-1">{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      {caseData.keywords && caseData.keywords.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-ink-100/40 uppercase tracking-widest mb-3">Keywords</p>
          <div className="flex flex-wrap gap-2">
            {caseData.keywords.map((kw, i) => (
              <button
                key={i}
                onClick={() => handleKeywordClick(kw)}
                className="text-xs font-mono text-gold/80 bg-gold/10 hover:bg-gold/20 border border-gold/20 rounded-full px-3 py-1.5 transition-all"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {caseData.sections_of_law && caseData.sections_of_law.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-ink-100/40 uppercase tracking-widest mb-3">Sections of Law</p>
          <div className="flex flex-col gap-1.5">
            {caseData.sections_of_law.map((sec, i) => (
              <button
                key={i}
                onClick={() => handleSectionClick(sec)}
                className="text-xs font-mono text-left text-amber-400/80 bg-amber-400/8 hover:bg-amber-400/15 border border-amber-400/20 rounded-lg px-3 py-2 transition-all"
              >
                {sec}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Precedents */}
      {caseData.precedents_cited && caseData.precedents_cited.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-ink-100/40 uppercase tracking-widest mb-3">Precedents Cited</p>
          <div className="flex flex-col gap-1.5">
            {caseData.precedents_cited.map((p, i) => (
              <button
                key={i}
                onClick={() => handlePrecedentClick(p)}
                className="text-xs font-mono text-left text-indigo-400/80 hover:text-indigo-300 bg-indigo-400/8 hover:bg-indigo-400/15 border border-indigo-400/20 rounded-lg px-3 py-2 transition-all"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Practice Areas */}
      {caseData.practice_area && caseData.practice_area.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {caseData.practice_area.map((pa, i) => (
            <span key={i} className="text-[10px] font-mono text-teal-400/60 bg-teal-400/10 border border-teal-400/20 rounded px-2.5 py-1 uppercase tracking-wide">{pa}</span>
          ))}
        </div>
      )}
    </div>
  );
}
