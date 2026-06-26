'use client';

import { useEffect } from 'react';
import Main from "./Content/Main";
import { useTerminalStore, useTerminalLiveSync } from "@/utils/stores/terminalStore";

const Dashboard = () => {
  const fetchRankings = useTerminalStore((s) => s.fetchRankings);
  const trendingTokens = useTerminalStore((s) => s.trendingTokens);
  const selectedPool = useTerminalStore((s) => s.selectedPool);
  const selectPool = useTerminalStore((s) => s.selectPool);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  useEffect(() => {
    if (!selectedPool && trendingTokens.length > 0) {
      selectPool(trendingTokens[0].poolAddress);
    }
  }, [selectedPool, trendingTokens, selectPool]);

  // Push-first: live trades + throttled stats/holders refresh off the data stream
  // (replaces the old 10s setInterval poll).
  useTerminalLiveSync(selectedPool);

  return (
    <div className="text-white">
      <Main />
    </div>
  );
};

export default Dashboard;