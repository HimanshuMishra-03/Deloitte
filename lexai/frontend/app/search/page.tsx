'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { search, getFacets } from '@/lib/api';
import type { CaseRecord, FacetsResponse } from '@/lib/types';
import SearchBar from '@/components/SearchBar';
import CaseCard from '@/components/CaseCard';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<FacetsResponse>({ outcomes: [], judgmentTypes: [] });
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);

  useEffect(() => {
    getFacets().then(setFacets).catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string, outcome?: string | null) => {
    if (!q || q.length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await search(q, outcome || undefined);
      setResults(res.results);
    } catch (e: any) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery, selectedOutcome);
  }, []);

  const handleSearch = (q: string) => {
    setQuery(q);
    router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false });
    doSearch(q, selectedOutcome);
  };

  const handleOutcome = (o: string) => {
    const next = selectedOutcome === o ? null : o;
    setSelectedOutcome(next);
    if (query) doSearch(query, next);
  };

  const OUTCOME_COLORS: Record<string, string> = {
    acquitted: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10',
    convicted: 'border-red-500/50 text-red-400 bg-red-500/10',
    remanded:  'border-blue-500/50 text-blue-400 bg-blue-500/10',
    modified:  'border-amber-500/50 text-amber-400 bg-amber-500/10',
    dismissed: 'border-gray-500/50 text-gray-400 bg-gray-500/10',
  };

  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-parchment mb-2">Search Judgments</h1>
        <p className="font-mono text-xs text-ink-100/40">
          Hybrid semantic + full-text search across Indian court judgments
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-10">
        <SearchBar defaultValue={query} onSearch={handleSearch} />
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* Left: Filters */}
        <div className="flex flex-col gap-6">
          {/* Outcome filter */}
          {facets.outcomes.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-100/30 mb-3">Outcome</p>
              <div className="flex flex-col gap-1.5">
                {facets.outcomes.map((o) => (
                  <button
                    key={o}
                    onClick={() => handleOutcome(o)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-mono transition-all text-left ${
                      selectedOutcome === o
                        ? OUTCOME_COLORS[o] || 'border-white/30 text-parchment bg-white/10'
                        : 'border-white/10 text-ink-100/50 hover:border-white/20 hover:text-parchment'
                    }`}
                  >
                    <span className="capitalize">{o}</span>
                    {selectedOutcome === o && <span className="ml-auto text-[9px]">✓</span>}
                  </button>
                ))}
              </div>
              {selectedOutcome && (
                <button
                  onClick={() => { setSelectedOutcome(null); if (query) doSearch(query, null); }}
                  className="mt-2 text-[10px] font-mono text-ink-100/30 hover:text-parchment transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}

          {/* Judgment type */}
          {facets.judgmentTypes.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-100/30 mb-3">Type</p>
              <div className="flex flex-col gap-1.5">
                {facets.judgmentTypes.slice(0, 8).map((t) => (
                  <div key={t} className="text-xs font-mono text-ink-100/40 px-2 py-1">{t}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div>
          {/* Status */}
          <div className="flex items-center justify-between mb-6">
            {query && !loading && (
              <p className="font-mono text-xs text-ink-100/40">
                {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
                {selectedOutcome && <span className="text-gold/60"> · {selectedOutcome} only</span>}
              </p>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-ink-100/40 font-mono text-xs">
                <div className="w-3 h-3 rounded-full border border-gold border-t-transparent animate-spin" />
                Searching…
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 font-mono text-sm mb-6">
              ⚠ {error}
            </div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {!loading && results.length > 0 && (
              <motion.div
                key={query + selectedOutcome}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-4"
              >
                {results.map((c, i) => (
                  <CaseCard key={c.id} caseData={c} index={i} />
                ))}
              </motion.div>
            )}

            {!loading && results.length === 0 && query && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <p className="text-4xl mb-4">⚖</p>
                <p className="font-serif text-parchment/60 text-lg mb-2">No results found</p>
                <p className="font-mono text-xs text-ink-100/30">
                  Try different keywords or remove filters
                </p>
              </motion.div>
            )}

            {!query && !loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <p className="text-4xl mb-4">🔍</p>
                <p className="font-serif text-parchment/60 text-lg mb-2">Enter a query above</p>
                <p className="font-mono text-xs text-ink-100/30">
                  Search by case name, legal provision, or issue
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
