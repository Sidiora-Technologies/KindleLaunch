'use client';

import React, { useEffect, useRef } from "react";
import ChartTopComponent from "./TopComponent";
import TableComponent from "./Table/TableComponent";
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { createUdfDatafeed } from "@/widgets/trading/udf-datafeed";

function TerminalChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const selectedPool = useTerminalStore((s) => s.selectedPool);
  const metadata = useTerminalStore((s) => s.metadata);

  const chartSymbol = metadata?.symbol
    ? `${metadata.symbol}/USDL`
    : selectedPool || '';

  useEffect(() => {
    if (!selectedPool || !containerRef.current) return;

    if (widgetRef.current) {
      try { widgetRef.current.remove(); } catch {}
      widgetRef.current = null;
    }
    containerRef.current.innerHTML = '';

    const datafeed = createUdfDatafeed(selectedPool);

    const initWidget = () => {
      if (!containerRef.current) return;
      const TradingView = (window as any).TradingView;
      if (!TradingView || !TradingView.widget) return;

      widgetRef.current = new TradingView.widget({
        container: containerRef.current,
        datafeed,
        symbol: chartSymbol,
        interval: '15',
        library_path: '/charting_library/',
        custom_css_url: '/charting_library/sidiora-theme.css',
        locale: 'en',
        timezone: 'Etc/UTC',
        theme: 'dark',
        autosize: true,
        toolbar_bg: '#020611',
        loading_screen: { backgroundColor: '#020611', foregroundColor: '#829FFF' },
        overrides: {
          'paneProperties.background': '#020611',
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': 'transparent',
          'paneProperties.horzGridProperties.color': 'transparent',
          'scalesProperties.backgroundColor': '#020611',
          'scalesProperties.textColor': '#4B5060',
          'scalesProperties.lineColor': 'rgba(25, 29, 42, 0.4)',
          'mainSeriesProperties.candleStyle.upColor': '#8BFFC5',
          'mainSeriesProperties.candleStyle.downColor': '#FF6367',
          'mainSeriesProperties.candleStyle.wickUpColor': '#8BFFC5',
          'mainSeriesProperties.candleStyle.wickDownColor': '#FF6367',
          'mainSeriesProperties.candleStyle.borderUpColor': '#8BFFC5',
          'mainSeriesProperties.candleStyle.borderDownColor': '#FF6367',
        },
        studies_overrides: {
          'volume.volume.color.0': '#FF636740',
          'volume.volume.color.1': '#8BFFC540',
          'volume.show ma': false,
        },
        disabled_features: [
          'header_symbol_search',
          'header_compare',
          'volume_force_overlay',
          'timeframes_toolbar',
          'go_to_date',
          'display_market_status',
          'create_volume_indicator_by_default',
          'legend_widget',
          'header_indicators',
          'compare_symbol',
          'header_screenshot',
          'header_undo_redo',
        ],
        enabled_features: [
          'move_logo_to_main_pane',
          'hide_left_toolbar_by_default',
        ],
      });
    };

    if ((window as any).TradingView?.widget) {
      initWidget();
    } else {
      const script = document.createElement('script');
      script.src = '/charting_library/charting_library.standalone.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    }

    return () => {
      try { widgetRef.current?.remove(); } catch {}
      widgetRef.current = null;
    };
  }, [selectedPool, chartSymbol]);

  if (!selectedPool) {
    return (
      <div className="flex items-center justify-center h-[300px] sm:h-[400px] text-dark-disabled text-size-14">
        Select a token to view chart
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}

const CenterComponent = () => {
  return (
    <div className="flex flex-col w-full gap-1">
      {/* Chart section */}
      <div className="rounded overflow-hidden" style={{ background: '#020611' }}>
        <ChartTopComponent />
        <div className="h-[400px] sm:h-[500px] xl:h-[calc(100vh-320px)]">
          <TerminalChart />
        </div>
      </div>

      {/* Trades / Holders table */}
      <TableComponent />
    </div>
  );
};

export default CenterComponent;