"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type ToastKind = "success" | "error";

interface ToastContextType {
  // Errors stay a little longer, so a guest has time to read why something wasn't sent
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, kind: ToastKind = "success") => {
    setToast({ message, kind });
    // A new toast restarts the timer, so an earlier one can't close it early
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), kind === "error" ? 5000 : 3200);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 px-4 py-2.5 rounded-full backdrop-blur-md animate-fadeIn text-xs font-montserrat tracking-wide shadow-[0_8px_24px_rgba(0,0,0,0.7)] ${
            toast.kind === "error" ? "bg-[#5a1414]/95 text-[#fff1ec] border border-[#ffb4a2]/60" : "bg-[#1b3b2b]/95 text-[#f5efe6] border border-[#d4af37]/60"
          }`}
        >
          {toast.kind === "error" ? (
            <AlertCircle className="w-4 h-4 text-[#ffb4a2] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#ffe5a3] shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
};
