"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { RecallForm } from "./recall-form";

// State machine: reading -> recalling. On transition the article unmounts so the
// text is off-screen during from-memory recall. Friction, not a wall - the body
// is still in the initial HTML payload; matches the self-discipline threat model
// (deliberate cheats: view-source, hard refresh - out of scope). No pushState,
// so the browser back button can't return to the text.
type Phase = "reading" | "recalling";

export function ReaderClient({
  chapterId,
  markdown,
}: {
  chapterId: string;
  markdown: string;
}) {
  const [phase, setPhase] = useState<Phase>("reading");

  if (phase === "reading") {
    return (
      <>
        <article className="prose prose-neutral mx-auto p-8">
          <Markdown>{markdown}</Markdown>
        </article>
        {/* confirm guards a stray click: once recalling, the text is hidden. */}
        <button
          onClick={() => {
            if (
              window.confirm("Start recall? The chapter text will be hidden.")
            )
              setPhase("recalling");
          }}
          className="mx-auto my-8 block rounded border-2 border-cobalt px-6 py-3 font-medium text-cobalt hover:bg-cobalt hover:text-paper"
        >
          Start recall
        </button>
      </>
    );
  }

  return <RecallForm chapterId={chapterId} />;
}
