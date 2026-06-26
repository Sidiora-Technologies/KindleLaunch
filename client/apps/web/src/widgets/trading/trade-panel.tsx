'use client';

import TradeToast from './trade-toast';
import SharePnlModal from '@/widgets/pnl/share-pnl-modal';
import { SlippageSelector, HighImpactWarning } from '@/widgets/trade/slippage-selector';
import { useTradePanel } from './use-trade-panel';
import {
  TradeTabs,
  AmountInput,
  BuyPresets,
  SellPcts,
  BalanceRow,
  TradePreview,
  ApprovalCheckbox,
  ActionButton,
  FeeFooter,
  SharePnlButton,
} from './trade-panel-parts';

interface TradePanelProps { poolAddress: string; }

/**
 * TradePanel — composition only.
 * All wagmi reads/writes, quoting, slippage, balance refresh, and PNL minting
 * live in `useTradePanel`. Pure UI atoms in `trade-panel-parts`.
 */
export default function TradePanel({ poolAddress }: TradePanelProps) {
  const t = useTradePanel({ poolAddress });

  return (
    <>
      <div className="rounded-2xl bg-[#0d1117] p-4 space-y-4">
        <TradeTabs
          isBuy={t.isBuy}
          onSwitch={t.switchMode}
          slippageNode={<SlippageSelector bps={t.slippageBps} onChange={t.setSlippageBps} />}
        />

        <AmountInput
          amount={t.amount}
          onChange={t.setAmount}
          inputDecimals={t.inputDecimals}
        />

        {t.isBuy ? (
          <BuyPresets amount={t.amount} onSelect={t.setAmount} />
        ) : (
          <SellPcts
            tokenBalance={t.tokenBalance}
            tokenDecimals={t.tokenDecimals}
            amount={t.amount}
            onSelect={t.handleSellPct}
          />
        )}

        {t.isConnected && (
          <BalanceRow
            isBuy={t.isBuy}
            usdlBalFmt={t.usdlBalFmt}
            tokenBalFmt={t.tokenBalFmt}
            tokenName={t.tokenName}
            poolPrice={t.poolStats?.price}
            onMax={t.handleMax}
          />
        )}

        {t.hasAmount && (
          <TradePreview
            isBuy={t.isBuy}
            tokenName={t.tokenName}
            estOutput={t.estOutput}
            priceImpact={t.priceImpact}
          />
        )}

        {t.needsApproval && t.hasAmount && (
          <ApprovalCheckbox unlimited={t.approveUnlimited} onChange={t.setApproveUnlimited} />
        )}

        {t.insufficientBalance && (
          <div className="text-red-middle text-size-11 text-center py-1">
            Insufficient {t.isBuy ? 'USDL' : t.tokenName || 'token'} balance
          </div>
        )}

        <ActionButton
          isConnected={t.isConnected}
          hasAmount={t.hasAmount}
          insufficientBalance={t.insufficientBalance}
          approveConfirming={t.approveConfirming}
          buyPending={t.buyPending}
          sellPending={t.sellPending}
          needsApproval={t.needsApproval}
          isBuy={t.isBuy}
          tokenName={t.tokenName}
          isPending={t.isPending}
          quoteUnavailable={t.quoteUnavailable}
          onClick={t.handleTrade}
        />

        <FeeFooter feePercent={t.feePercent} slippageBps={t.slippageBps} />

        {t.isConnected && t.address && t.tokenBalance !== null && t.tokenBalance > 0n && (
          <SharePnlButton
            tokenName={t.tokenName}
            state={t.mintState.kind}
            errorMessage={t.mintState.kind === 'error' ? t.mintState.message : undefined}
            onClick={t.handleSharePnl}
          />
        )}
      </div>

      {t.toastData && (
        <TradeToast
          data={t.toastData}
          onDismiss={() => t.setToastData(null)}
          onShare={t.address && t.isConnected ? t.handleSharePnl : undefined}
          sharing={t.mintState.kind === 'minting'}
          shareError={t.mintState.kind === 'error' ? t.mintState.message : null}
        />
      )}

      {t.showHighImpact && t.quote && (
        <HighImpactWarning
          priceImpactBps={t.quote.priceImpactBps}
          onConfirm={() => { t.setShowHighImpact(false); t.executeTrade(); }}
          onCancel={() => t.setShowHighImpact(false)}
        />
      )}

      {t.mintedCard && (
        <SharePnlModal
          card={t.mintedCard}
          tokenSymbol={t.tokenName || t.mintedCard.snapshot.tokenSymbol || null}
          onClose={t.resetPnlMint}
        />
      )}
    </>
  );
}
