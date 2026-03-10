'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getCase } from '@/lib/api';
import type { CaseRecord } from '@/lib/types';
import FieldBlock from '@/components/FieldBlock';
import HeadnotePanel from '@/components/HeadnotePanel';

const CASE_FIELDS = [
  'case_title', 'court_and_date', 'main_issue',
  'petitioner_args', 'respondent_args',
  'sections_of_law', 'precedents_cited',
  'court_reasoning', 'final_decision',
] as const;

// Map DB column names to ExtractionResult keys for validation lookup
const FIELD_TO_VALIDATION_KEY: Record<string, string> = {
  case_title: 'caseTitle',
  court_and_date: 'courtAndDate',
  main_issue: 'mainIssue',
  petitioner_args: 'petitionerArguments',
  respondent_args: 'respondentArguments',
  sections_of_law: 'sectionsOfLaw',
  precedents_cited: 'precedentsCited',
  court_reasoning: 'courtReasoning',
  final_decision: 'finalDecision',
};

export default function CasePage({ params }: { params: { id: string } }) {
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCase(params.id)
      .then(setCaseData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          <p className="font-mono text-ink-100/40 text-sm">Loading case…</p>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm">⚠ {error || 'Case not found'}</p>
          <a href="/" className="mt-4 inline-block text-gold/60 font-mono text-xs underline">← Back to home</a>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <a href="/search" className="font-mono text-xs text-ink-100/30 hover:text-gold/60 transition-colors">← Search</a>
          <span className="text-ink-100/20 font-mono text-xs">/</span>
          {caseData.judgment_type && (
            <span className="font-mono text-xs text-gold/60 bg-gold/10 px-2.5 py-1 rounded-full">{caseData.judgment_type}</span>
          )}
          {caseData.overall_confidence !== undefined && (
            <span className="font-mono text-xs text-ink-100/30">
              {(caseData.overall_confidence * 100).toFixed(0)}% overall confidence
            </span>
          )}
        </div>
        <h1 className="font-serif text-2xl md:text-3xl text-parchment leading-snug max-w-4xl">
          {caseData.case_title || 'Untitled Case'}
        </h1>
        {caseData.court_and_date && (
          <p className="font-mono text-sm text-ink-100/40 mt-2">{caseData.court_and_date}</p>
        )}
      </motion.div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        {/* Left: 9 Field Blocks */}
        <div className="flex flex-col gap-4">
          {CASE_FIELDS.map((fieldKey, i) => {
            const value = (caseData as any)[fieldKey];
            const valKey = FIELD_TO_VALIDATION_KEY[fieldKey];
            const validation = valKey ? caseData.validation_detail?.[valKey] : undefined;

            return (
              <motion.div
                key={fieldKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <FieldBlock fieldKey={fieldKey} value={value} validation={validation} />
              </motion.div>
            );
          })}
        </div>

        {/* Right: Headnote + Metadata (sticky) */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <HeadnotePanel caseData={caseData} />
        </div>
      </div>
    </main>
  );
}
