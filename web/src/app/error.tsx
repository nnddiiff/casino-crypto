"use client";

// Next 16: prop называется unstable_retry (не reset).
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Что-то пошло не так</h2>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Повторить
      </button>
    </div>
  );
}
