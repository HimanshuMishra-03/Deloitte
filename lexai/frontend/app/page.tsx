'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadZone from '@/components/UploadZone';
import AgentPipeline from '@/components/AgentPipeline';

export default function HomePage() {
  const [job, setJob] = useState<{ jobId: string; fileName: string } | null>(null);

  return (
    <main className="min-h-[calc(100vh-65px)] flex flex-col">
      {/* Hero */}
      <section className="px-6 pt-16 pb-10 text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 bg-gold/10 border border-gold/20 rounded-full px-4 py-1.5 text-gold font-mono text-xs uppercase tracking-widest mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          4-Agent Agentic Pipeline
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-serif text-4xl md:text-6xl text-parchment leading-tight mb-5"
        >
          Indian Case Law<br />
          <span className="text-gold">Intelligence</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-ink-100/60 text-lg max-w-xl mx-auto leading-relaxed"
        >
          Upload a PDF or DOCX judgment — our AI agents extract, validate,
          headnote, and index it in seconds.
        </motion.p>
      </section>

      {/* Main panel */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex-1 px-6 pb-16 max-w-7xl mx-auto w-full"
      >
        <div className="grid lg:grid-cols-2 gap-6 min-h-[500px]">
          {/* Left: Upload */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-8">
            <AnimatePresence mode="wait">
              {job ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full flex flex-col items-center justify-center gap-4 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-3xl">✓</span>
                  </div>
                  <p className="text-emerald-400 font-mono">Uploaded successfully</p>
                  <p className="text-ink-100/40 font-mono text-xs">{job.fileName}</p>
                  <button
                    onClick={() => setJob(null)}
                    className="mt-4 text-xs font-mono text-ink-100/40 hover:text-parchment transition-colors underline underline-offset-2"
                  >
                    Upload another
                  </button>
                </motion.div>
              ) : (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                  <UploadZone onJobStarted={(jobId, fileName) => setJob({ jobId, fileName })} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Pipeline */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-3xl p-8">
            <AnimatePresence mode="wait">
              {job ? (
                <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <AgentPipeline jobId={job.jobId} fileName={job.fileName} />
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center gap-6 opacity-30"
                >
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    {['Extraction', 'Validation', 'Headnote', 'Indexing'].map((stage, i) => (
                      <div key={stage} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center font-mono text-xs">{i + 1}</div>
                        <div className="flex-1 h-8 bg-white/5 rounded-lg" />
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-xs uppercase tracking-widest">Pipeline awaiting upload</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* Stats bar */}
      <div className="border-t border-white/[0.06] px-6 py-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { label: 'Agents', value: '4' },
            { label: 'Fields Extracted', value: '9' },
            { label: 'Search Type', value: 'Hybrid' },
            { label: 'Cost', value: 'Free' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="font-serif text-2xl text-gold">{value}</p>
              <p className="font-mono text-xs text-ink-100/40 uppercase tracking-widest mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
