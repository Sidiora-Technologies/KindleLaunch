'use client';

import { useEffect, useRef, useState } from 'react';
import { createUdfDatafeed, type ChartMode } from './udf-datafeed';

interface TvChartProps {
  poolAddress: string;
  symbol?: string;
}

declare global {
  interface Window {
    TradingView?: any;
  }
}

const TV_LIB_URL = '/charting_library/charting_library.standalone.js';
const TV_LIB_PATH = '/charting_library/';

export default function TvChart({ poolAddress, symbol }: TvChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setIntervalValue] = useState<'1' | '5' | '15' | '60'>('5');
  const [mode, setMode] = useState<ChartMode>('price');

  const INTERVALS: Array<{ label: string; value: '1' | '5' | '15' | '60' }> = [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1h', value: '60' },
  ];

  useEffect(() => {
    if (window.TradingView) {
      setLoaded(true);
      return;
    }

    let attempts = 0;
    const maxAttempts = 3;
    let currentScript: HTMLScriptElement | null = null;

    function tryLoad() {
      attempts++;
      if (currentScript?.parentNode) currentScript.parentNode.removeChild(currentScript);

      const script = document.createElement('script');
      script.src = TV_LIB_URL;
      script.async = true;
      script.onload = () => setLoaded(true);
      script.onerror = () => {
        if (attempts < maxAttempts) {
          setTimeout(tryLoad, 1000 * attempts);
        } else {
          setError('Chart library failed to load. Try refreshing the page.');
        }
      };
      currentScript = script;
      document.head.appendChild(script);
    }

    tryLoad();

    return () => {
      if (currentScript?.parentNode) currentScript.parentNode.removeChild(currentScript);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.TradingView) return;

    if (widgetRef.current) {
      try { widgetRef.current.remove(); } catch {}
      widgetRef.current = null;
    }

    const datafeed = createUdfDatafeed(poolAddress, mode);

    try {
      widgetRef.current = new window.TradingView.widget({
        container: containerRef.current,
        datafeed,
        symbol: symbol || poolAddress,
        interval,
        library_path: TV_LIB_PATH,
        custom_css_url: '/charting_library/sidiora-theme.css',
        locale: 'en',
        fullscreen: false,
        autosize: true,
        theme: 'dark',
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
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize chart');
    }

    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch {}
        widgetRef.current = null;
      }
    };
  }, [loaded, poolAddress, symbol, interval, mode]);

  if (error) {
    return (
      <div className="border border-dark-gray rounded-xl h-[390px] sm:h-[540px] flex items-center justify-center text-dark-disabled text-size-12 bg-black-gray2 w-full max-w-full overflow-hidden">
        Chart unavailable: {error}. Try another timeframe.
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="rounded-xl border border-dark-gray overflow-hidden relative w-full bg-black-gray2">
        <div className="h-10 border-b border-dark-gray px-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {INTERVALS.map((item) => (
              <button
                key={item.value}
                onClick={() => setIntervalValue(item.value)}
                className={`px-2 py-1 rounded-md text-size-10 font-manrope-bold transition ${
                  interval === item.value
                    ? 'bg-dark-gray3 text-white'
                    : 'text-dark-disabled hover:text-half-enabled hover:bg-dark-gray2'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="w-px h-4 bg-dark-gray mx-1 flex-shrink-0" />
            {(['price', 'mcap'] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 rounded-md text-size-10 font-manrope-bold transition ${
                  mode === m
                    ? 'bg-dark-gray3 text-white'
                    : 'text-dark-disabled hover:text-half-enabled hover:bg-dark-gray2'
                }`}
              >
                {m === 'price' ? 'Price' : 'MCap'}
              </button>
            ))}
          </div>
          <div className="text-size-9 text-dark-disabled">TradingView</div>
        </div>
        <div className="h-[350px] sm:h-[500px] relative w-full" style={{ background: '#020611' }}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-dark-disabled text-size-12 animate-pulse">
            Loading chart...
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    </div>
  );
}
