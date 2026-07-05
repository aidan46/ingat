"use client";

import { useEffect, useState } from "react";

// Wire contract from GET /api/review/due. Duplicated client-side on purpose:
// the route is server-only. question is presentable; expectedAnswer is NOT here
// (it arrives only in GradeResult, post-submit).
type QueueItem = {
  id: string;
  label: string;
  currentTier: string;
  chapter: { title: string; book: { title: string; slug: string } };
  question?: string;
};

// Wire contract from POST /api/review/grade. expectedAnswer revealed post-submit.
type GradeResult = {
  correct: boolean;
  rating: number;
  feedback: string;
  expectedAnswer: string;
};

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the due queue once on mount.
  useEffect(() => {
    // Inner async fn: effect callback can't be async (returns cleanup, not Promise).
    const fetchQueue = async () => {
      const res = await fetch("/api/review/due");
      if (res.ok) {
        setQueue((await res.json()) as QueueItem[]);
      } else {
        setError(await res.text());
      }
    };

    void fetchQueue();
  }, []);

  const current = queue?.[index];

  async function onSubmit() {
    // Guard narrows current (undefined above the render branches).
    if (!current) return;
    setLoading(true);
    // Clear prior result+error: failed resubmit must not show stale output.
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/review/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: current.id, answer }),
      });
      if (!res.ok)
        setError(`grade failed (${res.status}): ${await res.text()}`);
      else setResult((await res.json()) as GradeResult);
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  // Advance to next card; reset per-card state.
  function onNext() {
    setIndex(index + 1);
    setAnswer("");
    setResult(null);
    setError(null);
  }

  // --- render branches ---

  if (queue === null && !error) {
    return (
      <p className="mx-auto max-w-prose p-8 text-clay">Loading queue...</p>
    );
  }

  if (error && !current) {
    return <p className="mx-auto max-w-prose p-8">{error}</p>;
  }

  // Empty queue, or advanced past the end = session done.
  if (!current) {
    return (
      <p className="mx-auto max-w-prose p-8 text-clay">
        Nothing due. You are caught up.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-prose p-8">
      {/* Provenance: which book/chapter this concept came from. */}
      <p className="text-sm text-clay">
        {current.chapter.book.title} / {current.chapter.title} /{" "}
        {current.currentTier}
      </p>
      <h2 className="my-2 font-medium">{current.label}</h2>
      <p className="my-4">{current.question ?? "(no probe at this tier)"}</p>

      {/* Pre-submit: answer box. Post-submit: result + reveal + next. */}
      {result === null ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={loading}
            rows={8}
            placeholder="Answer from memory."
            className="w-full rounded border p-2"
          />
          {/* void: onClick wants void, not the Promise. */}
          <button
            onClick={() => void onSubmit()}
            disabled={loading || !answer.trim()}
            className="mx-auto my-8 block rounded border-2 border-cobalt px-6 py-3 font-medium text-cobalt hover:bg-cobalt hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Grading..." : "Submit answer"}
          </button>
          {error && <p>{error}</p>}
        </>
      ) : (
        <>
          <p>
            {result.correct ? "Correct" : "Not quite"} - rating {result.rating}
            /4
          </p>
          <p className="my-2">{result.feedback}</p>
          {/* Sealed reveal: expectedAnswer only after submit. */}
          <p className="my-2 text-clay">Expected: {result.expectedAnswer}</p>
          <button
            onClick={onNext}
            className="mx-auto my-8 block rounded border-2 border-cobalt px-6 py-3 font-medium text-cobalt hover:bg-cobalt hover:text-paper"
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
