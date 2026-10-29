"use client";
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-[#191919]">
    <h2 className="text-xl font-semibold">Unable to load this page</h2><p className="mt-2 text-gray-600 dark:text-[#aaaaaa]">Please try again in a moment.</p>
    {digest && <p className="mt-2 text-xs text-gray-500">Error reference: {digest}</p>}
    <button type="button" onClick={retry} className="mt-4 rounded bg-red-700 px-4 py-2 text-white">Try again</button>
  </div>;
}
