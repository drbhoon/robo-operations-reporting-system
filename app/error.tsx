"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-shell">
      <section className="error-card">
        <AlertTriangle size={28} />
        <div>
          <p className="eyebrow">Application error</p>
          <h1>Unable to load the operations screen</h1>
          <p className="subtitle">
            The page hit a runtime error while loading. Retry once; if it repeats, share this message with support.
          </p>
          <p className="error-detail">{error.message || error.digest || "Unknown runtime error"}</p>
          <button className="btn primary" onClick={reset}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
