'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { CaseRecord } from '@/lib/types';

const OUTCOME_STYLES: Record<string, string> = {
  acquitted: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  convicted: 'bg-red-500/20 text-red-400 border border-red-500/30',
  remanded:  'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  modified:  'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  dismissed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

interface CaseCardProps {
  caseData: CaseRecord;
  score?: number;
  index?: number;
}

export default function CaseCard({ caseData, score, index = 0 }: CaseCardProps) {
  const outcome = caseData.outcome || 'dismissed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link href={`/case/${caseData.id}`}>
        <div className="group bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:border-gold/40 hover:bg-white/[0.06] transition-all duration-300 cursor-pointer">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <h3 className="font-serif text-parchment text-base group-hover:text-gold/90 transition-colors leading-snug line-clamp-2">
              {caseData.case_title || 'Untitled Case'}
            </h3>
            <span className={`flex-shrink-0 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full ${OUTCOME_STYLES[outcome]}`}>
              {outcome}
            </span>
          </div>

          {/* Court + Date */}
          {caseData.court_and_date && (
            <p className="text-ink-100/40 font-mono text-xs mb-3">{caseData.court_and_date}</p>
          )}

          {/* Summary */}
          {caseData.short_summary && (
            <p className="text-ink-100/70 text-sm leading-relaxed line-clamp-2 mb-4">
              {caseData.short_summary}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {caseData.judgment_type && (
                <span className="text-[10px] font-mono text-gold/60 bg-gold/10 px-2 py-0.5 rounded">
                  {caseData.judgment_type}
                </span>
              )}
              {caseData.overall_confidence !== undefined && (
                <span className="text-[10px] font-mono text-ink-100/40">
                  {(caseData.overall_confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>

            {/* Score bar */}
            {score !== undefined && (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all"
                    style={{ width: `${(score * 100).toFixed(0)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-gold/60">
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
