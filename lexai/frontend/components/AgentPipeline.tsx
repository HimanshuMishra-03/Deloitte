'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { createEventSource } from '@/lib/api';
import type { PipelineEvent } from '@/lib/types';

type StageStatus = 'idle' | 'running' | 'done' | 'retrying';

interface AgentRow {
  key: PipelineEvent['stage'];
  label: string;
  code: string;
  description: string;
}

const AGENTS: AgentRow[] = [
  { key: 'extraction', label: 'Extraction Agent', code: 'AGT-1', description: 'Parsing judgment structure' },
  { key: 'validation', label: 'Validation Agent', code: 'AGT-2', description: 'Grounding fields against source' },
  { key: 'headnote',   label: 'Headnote Agent',   code: 'AGT-3', description: 'Generating SCC-style headnote' },
  { key: 'indexing',   label: 'Index Agent',       code: 'AGT-4', description: 'Writing to NeonDB + Qdrant' },
];

const STATUS_COLORS: Record<StageStatus, string> = {
  idle:     'border-white/10 text-white/20',
  running:  'border-amber-400 text-amber-400',
  done:     'border-emerald-500 text-emerald-400',
  retrying: 'border-orange-400 text-orange-400',
};

interface AgentPipelineProps {
  jobId: string;
  fileName: string;
}

export default function AgentPipeline({ jobId, fileName }: AgentPipelineProps) {
  const router = useRouter();
  const [stages, setStages] = useState<Record<string, StageStatus>>({
    extraction: 'idle', validation: 'idle', headnote: 'idle', indexing: 'idle',
  });
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = createEventSource(jobId);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed: PipelineEvent = JSON.parse(event.data);
        const { stage, status, message, preview, caseId, error: errMsg } = parsed;

        if (stage === 'complete') {
          if (status === 'failed' || errMsg) {
            setError(errMsg || 'Pipeline failed');
          } else if (caseId) {
            // Navigate to case result
            setTimeout(() => router.push(`/case/${caseId}`), 800);
          }
          es.close();
          return;
        }

        setStages(prev => ({
          ...prev,
          [stage]: status as StageStatus,
        }));

        if (message) setMessages(prev => ({ ...prev, [stage]: message }));
        if (preview) setPreviews(prev => ({ ...prev, [stage]: preview }));
      } catch (e) {
        console.error('SSE parse error', e);
      }
    };

    es.onerror = () => {
      setError('Connection lost. The pipeline may still be running.');
      es.close();
    };

    return () => { es.close(); };
  }, [jobId, router]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h2 className="font-serif text-2xl text-parchment mb-1">Processing Pipeline</h2>
        <p className="text-ink-100/50 font-mono text-xs truncate">{fileName}</p>
      </div>

      {/* Gold spine with agent rows */}
      <div className="relative flex flex-col gap-0">
        {/* Vertical spine */}
        <div className="absolute left-[22px] top-8 bottom-8 w-px bg-gradient-to-b from-gold/80 via-gold/40 to-transparent" />

        {AGENTS.map((agent, idx) => {
          const status = stages[agent.key] || 'idle';
          const msg = messages[agent.key];
          const preview = previews[agent.key];

          return (
            <motion.div
              key={agent.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative flex items-start gap-4 py-5 pl-2"
            >
              {/* Node */}
              <div className={`relative z-10 w-11 h-11 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${STATUS_COLORS[status]} bg-ink-900`}>
                {status === 'running' && (
                  <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-40" />
                )}
                {status === 'done'
                  ? <span className="text-lg">✓</span>
                  : status === 'retrying'
                  ? <span className="text-xs font-mono">↺</span>
                  : <span className="font-mono text-[10px]">{idx + 1}</span>}
              </div>

              {/* Content */}
              <div className="flex flex-col gap-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-gold/60 bg-gold/10 px-2 py-0.5 rounded">
                    {agent.code}
                  </span>
                  <span className="text-parchment font-medium text-sm">{agent.label}</span>
                  {status === 'retrying' && (
                    <span className="text-[10px] font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">
                      RETRYING
                    </span>
                  )}
                </div>

                <p className="text-ink-100/50 text-xs font-mono">
                  {msg || agent.description}
                </p>

                {/* Preview chips */}
                <AnimatePresence>
                  {preview && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex flex-wrap gap-1 mt-1"
                    >
                      {Object.entries(preview).map(([k, v]) => (
                        <span key={k} className="text-[10px] font-mono bg-white/5 text-parchment/70 rounded px-2 py-0.5">
                          {k}: {
                            Array.isArray(v)
                              ? (v as string[]).join(', ')
                              : typeof v === 'number'
                              ? (v as number).toFixed(2)
                              : String(v)
                          }
                        </span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm font-mono"
          >
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Redirecting */}
      {!error && stages.indexing === 'done' && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-emerald-400 font-mono text-sm text-center"
        >
          ✓ Complete — redirecting to case view…
        </motion.div>
      )}
    </div>
  );
}
