'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';

const EXAMPLE_QUERIES = [
  'Show acquittals under IPC 420',
  'Cases on criminal breach of trust',
  'Cases citing Hridaya Ranjan Prasad Verma',
  'Bail matters under NDPS Act',
];

interface SearchBarProps {
  defaultValue?: string;
  onSearch?: (query: string) => void;
  onVoiceRecord?: () => void;
}

export default function SearchBar({ defaultValue = '', onSearch, onVoiceRecord }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  const handleSubmit = (q: string) => {
    if (!q.trim() || q.trim().length < 3) return;
    if (onSearch) {
      onSearch(q.trim());
    } else {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Input */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
          </svg>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit(value)}
          placeholder="Search Indian judgments by issue, section, precedent…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-12 pr-32 py-4 text-parchment placeholder-ink-100/30 font-sans text-base focus:outline-none focus:border-gold/50 focus:bg-white/[0.06] transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {onVoiceRecord && (
            <button
              onClick={onVoiceRecord}
              title="Voice Search"
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gold transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => handleSubmit(value)}
            className="bg-gold hover:bg-gold-light text-ink-900 font-mono text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((q) => (
          <motion.button
            key={q}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setValue(q); handleSubmit(q); }}
            className="text-xs font-mono text-gold/70 bg-gold/10 hover:bg-gold/20 border border-gold/20 rounded-full px-3 py-1.5 transition-all"
          >
            {q}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
