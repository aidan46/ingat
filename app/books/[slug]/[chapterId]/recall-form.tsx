"use client";

import { useState } from "react";

// Wire contract from POST /api/recall. Duplicated client-side on purpose:
// grader.ts is server-only, can't be imported here. This type IS the seal -
// only labels + score + feedback, never probes/expectedAnswer.
type RecallResult = {
  score: number;
  captured: string[];
  partial: string[];
  missed: string[];
  errors: { claim: string; correction: string }[];
  questions: string[];
  verdict: string;
};

export function RecallForm({ chapterId }: { chapterId: string }) {
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<RecallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setLoading(true);
    // Clear prior result+error: failed resubmit must not show stale output.
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, summary }),
      });
      if (!res.ok)
        setError(`recall failed (${res.status}): ${await res.text()}`);
      else setResult((await res.json()) as RecallResult);
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-prose p-8">
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={loading}
        rows={10}
        placeholder="Write what you remember, from memory."
        className="w-full rounded border p-2"
      />
      {/* void: onClick wants a void return, not the Promise; fire-and-forget. */}
      <button
        onClick={() => void onSubmit()}
        disabled={loading || !summary.trim()}
      >
        Submit recall
      </button>
      {error && <p>{error}</p>}
      {result && (
        <>
          <p>Score: {result.score}</p>
          <p>{result.verdict}</p>
          <p>Captured: {result.captured.join(", ")}</p>
          <p>Partial: {result.partial.join(", ")}</p>
          <p>Missed: {result.missed.join(", ")}</p>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.claim} → {e.correction}
              </li>
            ))}
          </ul>
          <ul>
            {result.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
