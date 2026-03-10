'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FieldValidation } from '@/lib/types';

const FIELD_LABELS: Record<string, string> = {
  case_title: 'Case Title',
  court_and_date: 'Court & Date',
  main_issue: 'Main Issue',
  petitioner_args: 'Petitioner Arguments',
  respondent_args: 'Respondent Arguments',
  sections_of_law: 'Sections of Law',
  precedents_cited: 'Precedents Cited',
  court_reasoning: 'Court Reasoning',
  final_decision: 'Final Decision',
};

const FIELD_COLORS: Record<string, string> = {
  case_title: 'text-purple-400 bg-purple-400/10',
  court_and_date: 'text-blue-400 bg-blue-400/10',
  main_issue: 'text-teal-400 bg-teal-400/10',
  petitioner_args: 'text-orange-400 bg-orange-400/10',
  respondent_args: 'text-rose-400 bg-rose-400/10',
  sections_of_law: 'text-yellow-400 bg-yellow-400/10',
  precedents_cited: 'text-indigo-400 bg-indigo-400/10',
  court_reasoning: 'text-emerald-400 bg-emerald-400/10',
  final_decision: 'text-gold bg-gold/10',
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.85) {
    return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">{(confidence * 100).toFixed(0)}%</span>;
  }
  if (confidence >= 0.70) {
    return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{(confidence * 100).toFixed(0)}%</span>;
  }
  return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">{(confidence * 100).toFixed(0)}%</span>;
}

interface FieldBlockProps {
  fieldKey: string;
  value: string | string[] | undefined;
  validation?: FieldValidation;
}

export default function FieldBlock({ fieldKey, value, validation }: FieldBlockProps) {
  const [showSource, setShowSource] = useState(false);
  const label = FIELD_LABELS[fieldKey] || fieldKey;
  const colorClass = FIELD_COLORS[fieldKey] || 'text-parchment bg-white/10';
  const isEmpty = !value || (Array.isArray(value) && value.length === 0);

  if (isEmpty) return null;

  const renderValue = () => {
    if (Array.isArray(value)) {
      return (
        <ul className="space-y-1.5">
          {value.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-ink-100/80 text-sm leading-relaxed">
              <span className="text-gold/50 font-mono text-xs mt-0.5 flex-shrink-0">{(i + 1).toString().padStart(2, '0')}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    return <p className="text-ink-100/80 text-sm leading-relaxed">{value}</p>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors"
    >
      {/* Label + Confidence */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded ${colorClass}`}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {validation && <ConfidenceBadge confidence={validation.confidence} />}
          {validation?.sourceSpan && (
            <button
              onClick={() => setShowSource(v => !v)}
              className="text-[10px] font-mono text-ink-100/30 hover:text-gold/60 transition-colors"
            >
              {showSource ? '▲ source' : '▼ source'}
            </button>
          )}
        </div>
      </div>

      {/* Value */}
      {renderValue()}

      {/* Source accordion */}
      <AnimatePresence>
        {showSource && validation?.sourceSpan && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-[10px] font-mono text-gold/60 mb-2 uppercase tracking-widest">Source Evidence</p>
              <blockquote className="font-mono text-xs text-ink-100/50 bg-white/5 rounded-lg p-3 italic border-l-2 border-gold/30 leading-relaxed">
                "{validation.sourceSpan}"
              </blockquote>
              {validation.flagReason && (
                <p className="text-[10px] font-mono text-amber-400/70 mt-2">⚠ {validation.flagReason}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
