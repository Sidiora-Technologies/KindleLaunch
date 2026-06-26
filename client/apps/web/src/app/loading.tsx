export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-10 w-10 rounded-full border-2 border-dark-gray/30 border-t-emerald-400 animate-spin" />
          <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-b-emerald-400/20 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <p className="text-size-12 text-dark-disabled animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
