'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RagResponse, VoiceRagResponse } from '@/lib/types';

interface RagResultsProps {
  data: RagResponse | VoiceRagResponse | null;
  loading: boolean;
  onClose: () => void;
}

export default function RagResults({ data, loading, onClose }: RagResultsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Auto-play if voice data arrives
    if (data && 'audio_base64' in data && data.audio_base64) {
      handlePlay();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [data]);

  const handlePlay = () => {
    if (!data || !('audio_base64' in data) || !data.audio_base64) return;

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    const audioData = `data:audio/${data.audio_format || 'wav'};base64,${data.audio_base64}`;
    const audio = new Audio(audioData);
    audioRef.current = audio;
    
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);
    
    audio.play();
  };

  const togglePlay = () => {
    if (!audioRef.current) {
      handlePlay();
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  if (!loading && !data) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gold/5 border border-gold/20 rounded-3xl p-8 mb-10 overflow-hidden relative"
    >
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <svg className="w-32 h-32 text-gold" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
        </svg>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center">
            <span className="text-gold text-sm">✨</span>
          </div>
          <h2 className="font-serif text-xl text-parchment">AI Judgment Assistant</h2>
        </div>
        {!loading && data && (
          <button
            onClick={onClose}
            className="text-ink-100/30 hover:text-parchment transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-10 flex flex-col items-center gap-4"
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    className="w-2 h-2 rounded-full bg-gold"
                  />
                ))}
              </div>
              <p className="font-mono text-xs text-gold/60 uppercase tracking-widest">Consulting Legal Agents...</p>
            </motion.div>
          ) : data ? (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Answer section */}
              <div className="space-y-4">
                {('transcribed_query' in data) && (
                  <p className="font-mono text-xs text-ink-100/40 italic">
                    " {data.transcribed_query} "
                  </p>
                )}
                <div className="prose prose-invert max-w-none">
                  <p className="text-parchment text-lg leading-relaxed font-serif">
                    {data.answer}
                  </p>
                </div>
                
                {('audio_base64' in data) && data.audio_base64 && (
                  <button
                    onClick={togglePlay}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-ink-900 font-mono text-xs font-bold hover:bg-gold-light transition-all shadow-lg shadow-gold/10"
                  >
                    {isPlaying ? (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                        Pause Reading
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Play AI Response
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Sources section */}
              <div className="pt-6 border-t border-gold/10">
                <p className="font-mono text-[10px] uppercase tracking-widest text-gold/50 mb-4">Cited Judgments & Excerpts</p>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.sources.map((source, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-2 group hover:border-gold/30 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-xs text-gold truncate flex-1 mr-2">{source.case_title}</span>
                        <span className="font-mono text-[10px] text-ink-100/30 whitespace-nowrap">{source.section}</span>
                      </div>
                      <p className="text-ink-100/50 text-[11px] leading-relaxed line-clamp-3 font-sans">
                        {source.excerpt}
                      </p>
                      <div className="mt-auto pt-2 flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, starIdx) => (
                            <div key={starIdx} className={`w-1.5 h-1.5 rounded-full ${starIdx < Math.round(source.score * 5) ? 'bg-gold' : 'bg-white/10'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] font-mono text-ink-100/20 uppercase tracking-tighter">Reference Score: {source.score}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 font-mono text-[9px] text-ink-100/30">
                <span>Latency: {data.latency_ms}ms</span>
                <span>•</span>
                <span>Model: Phi-3 Mini 4k</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
