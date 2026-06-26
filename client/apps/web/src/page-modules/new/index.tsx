'use client';
import TokenGrid from '@/widgets/home/token-grid';
export default function NewModule() {
  return (
    <div className="py-4 text-white">
      <h1 className="px-4 text-size-16 font-manrope-bold mb-4">New Launches</h1>
      <TokenGrid category="new" />
    </div>
  );
}
