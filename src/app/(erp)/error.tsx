"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-[#191919]">
    <h2 className="text-xl font-semibold">Unable to load this page</h2><p className="mt-2 text-gray-600 dark:text-[#aaaaaa]">Please try again in a moment.</p>
    <button type="button" onClick={reset} className="mt-4 rounded bg-red-700 px-4 py-2 text-white">Try again</button>
  </div>;
}
