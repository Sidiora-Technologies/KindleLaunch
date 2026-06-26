const EXPLORER_API = process.env.NEXT_PUBLIC_EXPLORER_API || 'https://api.paxscan.io/api/v2';

// ── Types ────────────────────────────────────────────────────

export interface AddressCounters {
  transactionsCount: number;
  tokenTransfersCount: number;
  gasUsageCount: number;
}

export interface ExplorerAddressParam {
  hash: string;
  implementation_name?: string;
  is_contract?: boolean;
  is_verified?: boolean;
  name?: string;
  private_tags?: { label: string; display_name: string }[];
  public_tags?: { label: string; display_name: string }[];
}

export interface ExplorerTransaction {
  hash: string;
  block_number?: number;
  timestamp: string;
  from: ExplorerAddressParam;
  to: ExplorerAddressParam | null;
  value: string;
  fee: { type: string; value: string };
  method?: string;
  status?: string;
  result?: string;
  tx_types?: string[];
}

export interface ExplorerTokenTransfer {
  block_number: number;
  from: ExplorerAddressParam;
  to: ExplorerAddressParam;
  timestamp: string;
  token: {
    address: string;
    decimals: string;
    exchange_rate: string | null;
    icon_url: string | null;
    name: string;
    symbol: string;
    type: string;
  };
  total: { decimals: string; value: string };
  tx_hash: string;
  type: string;
}

export interface ExplorerTokenInfo {
  address: string;
  circulating_market_cap?: string;
  decimals?: string;
  exchange_rate?: string;
  holders_count?: string;
  icon_url?: string;
  name?: string;
  symbol?: string;
  total_supply?: string;
  type?: string;
}

export interface ExplorerSearchItem {
  type: string;
  address?: string;
  address_hash?: string;
  name?: string;
  symbol?: string;
  icon_url?: string;
  token_url?: string;
  token_type?: string;
  total_supply?: string;
  exchange_rate?: string;
  is_smart_contract_verified?: boolean;
  url?: string;
}

// ── Fetchers ─────────────────────────────────────────────────

async function explorerFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${EXPLORER_API}${path}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAddressCounters(address: string): Promise<AddressCounters> {
  const data = await explorerFetch<{
    transactions_count: string;
    token_transfers_count: string;
    gas_usage_count: string;
  }>(`/addresses/${address}/counters`);
  if (!data) return { transactionsCount: 0, tokenTransfersCount: 0, gasUsageCount: 0 };
  return {
    transactionsCount: parseInt(data.transactions_count ?? '0', 10),
    tokenTransfersCount: parseInt(data.token_transfers_count ?? '0', 10),
    gasUsageCount: parseInt(data.gas_usage_count ?? '0', 10),
  };
}

export async function fetchAddressTransactions(
  address: string,
  pageParams?: Record<string, string>,
): Promise<{ items: ExplorerTransaction[]; nextPageParams: Record<string, string> | null }> {
  let path = `/addresses/${address}/transactions`;
  if (pageParams) {
    const qs = new URLSearchParams(pageParams).toString();
    if (qs) path += `?${qs}`;
  }
  const data = await explorerFetch<{
    items: ExplorerTransaction[];
    next_page_params: Record<string, string> | null;
  }>(path);
  return { items: data?.items ?? [], nextPageParams: data?.next_page_params ?? null };
}

export async function fetchAddressTokenTransfers(
  address: string,
  pageParams?: Record<string, string>,
): Promise<{ items: ExplorerTokenTransfer[]; nextPageParams: Record<string, string> | null }> {
  let path = `/addresses/${address}/token-transfers`;
  if (pageParams) {
    const qs = new URLSearchParams(pageParams).toString();
    if (qs) path += `?${qs}`;
  }
  const data = await explorerFetch<{
    items: ExplorerTokenTransfer[];
    next_page_params: Record<string, string> | null;
  }>(path);
  return { items: data?.items ?? [], nextPageParams: data?.next_page_params ?? null };
}

export async function fetchTokenInfo(tokenAddress: string): Promise<ExplorerTokenInfo | null> {
  return explorerFetch<ExplorerTokenInfo>(`/tokens/${tokenAddress}`);
}

export async function explorerSearch(query: string): Promise<ExplorerSearchItem[]> {
  const data = await explorerFetch<{
    items: ExplorerSearchItem[];
    next_page_params: Record<string, string> | null;
  }>(`/search?q=${encodeURIComponent(query)}`);
  return data?.items ?? [];
}
