'use client';

import { useEffect } from 'react';
import Main from "./Content/Main";
import { useTerminalStore } from "@/utils/stores/terminalStore";

const Dashboard = () => {
  const fetchRankings = useTerminalStore((s) => s.fetchRankings);
  const trendingTokens = useTerminalStore((s) => s.trendingTokens);
  const selectedPool = useTerminalStore((s) => s.selectedPool);
  const selectPool = useTerminalStore((s) => s.selectPool);
  const startPolling = useTerminalStore((s) => s.startPolling);
  const stopPolling = useTerminalStore((s) => s.stopPolling);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  useEffect(() => {
    if (!selectedPool && trendingTokens.length > 0) {
      selectPool(trendingTokens[0].poolAddress);
    }
  }, [selectedPool, trendingTokens, selectPool]);

  useEffect(() => {
    if (selectedPool) {
      startPolling();
      return () => stopPolling();
    }
  }, [selectedPool, startPolling, stopPolling]);

  return (
    <div className="text-white">
      <Main />
    </div>
  );
};

export default Dashboard;