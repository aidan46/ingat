export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="font-mono text-sm uppercase tracking-widest text-clay">
        ingat
      </span>
      <h1 className="mt-4 max-w-2xl font-display text-5xl font-bold leading-tight text-ink">
        Read once. <span className="text-cobalt">Remember on schedule.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-ink/70">
        A spaced-repetition reader that turns chapters into concepts, grades
        your recall, and schedules reviews so knowledge sticks.
      </p>
      <p className="mt-10 font-mono text-xs text-ink/50">
        M0 scaffold — foundation only.
      </p>
    </main>
  );
}
