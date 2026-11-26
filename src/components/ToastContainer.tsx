import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, GitMerge, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'merge' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  detail: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-full max-w-sm pointer-events-none px-4 sm:px-0"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const borderTone =
            toast.tone === 'merge'
              ? 'border-emerald-500/50'
              : toast.tone === 'success'
              ? 'border-emerald-500/35'
              : toast.tone === 'warning'
              ? 'border-amber-500/45'
              : toast.tone === 'error'
              ? 'border-red-500/50'
              : 'border-[#1E2E4A]';

          const icon =
            toast.tone === 'merge' ? (
              <GitMerge className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : toast.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : toast.tone === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : toast.tone === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            );

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto bg-[#0D1628] border ${borderTone} rounded-xl p-3.5 shadow-lg flex items-start gap-3`}
            >
              {icon}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-100">{toast.title}</p>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed break-words">
                  {toast.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="p-1 text-slate-400 hover:text-slate-100 rounded-md cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
