'use client'

import { useState, useEffect } from 'react';

const FullHeightScrollable = ({
  children,
  offset = 0,
  overOff,
}: { children: React.ReactNode; offset?: number; overOff?: boolean }) => {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const updateHeight = () => {
      setHeight(window.innerHeight - offset);
    };

    // Initial setup
    updateHeight();

    // Event listeners
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [offset]);

  // Determine overflow behavior
  const overflowClass = 'overflow-y-auto';
  
  return (
    <div 
      className={`${overflowClass} w-full`}
      style={ overOff ? {height: 'full'} : { height: `${height}px` }}
    >
      {children}
    </div>
  );
};

export default FullHeightScrollable;