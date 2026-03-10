'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadFile } from '@/lib/api';

interface UploadZoneProps {
  onJobStarted: (jobId: string, fileName: string) => void;
}

export default function UploadZone({ onJobStarted }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ALLOWED = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError('Only PDF and DOCX files are supported.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File must be less than 50 MB.');
      return;
    }

    setIsUploading(true);
    try {
      const { jobId, fileName } = await uploadFile(file);
      onJobStarted(jobId, fileName);
    } catch (e: any) {
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [onJobStarted]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="font-serif text-2xl text-parchment mb-2">Upload Judgment</h2>
        <p className="text-ink-100/60 text-sm font-mono">PDF or DOCX · Max 50 MB</p>
      </div>

      {/* Drop Zone */}
      <motion.div
        className={`relative w-full max-w-md border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-gold bg-gold/10 scale-[1.02]'
            : 'border-ink-100/20 hover:border-gold/50 hover:bg-white/5'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* Icon */}
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="spinner"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full border-2 border-gold border-t-transparent animate-spin" />
              <span className="text-gold font-mono text-sm">Processing document…</span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-parchment font-medium">Drop your judgment here</p>
                <p className="text-ink-100/50 text-sm mt-1">or click to browse</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 text-red-400 text-sm font-mono bg-red-400/10 rounded-lg px-4 py-3 max-w-md"
          >
            <span className="text-red-400">⚠</span> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      <p className="text-ink-100/30 text-xs font-mono text-center max-w-xs">
        Supreme Court · High Court · Tribunal judgments
      </p>
    </div>
  );
}
