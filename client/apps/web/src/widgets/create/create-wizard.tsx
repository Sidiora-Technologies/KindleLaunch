'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import { parseUnits, formatUnits, zeroAddress } from 'viem';
import {
  useWriteRouterCreateMarket,
  useWriteRouterBuy,
  useWriteErc20Approve,
  useReadErc20Allowance,
  useReadCreationFee,
  useReadOpticalRegistryGetAllOpticals,
  useReadErc20Decimals,
  ROUTER_ADDRESS,
  OPTICAL_REGISTRY_ADDRESS,
  USDL_ADDRESS,
} from '@/core/network/contracts';
import RouterAbi from '@/core/network/abis/Router.json';
import OpticalRegistryAbi from '@/core/network/abis/OpticalRegistry.json';
import { useRouter } from 'next/navigation';
import { sdkBaseUrls } from '@/core/sdk-config';

interface WizardFormData {
  name: string;
  symbol: string;
  description: string;
  customTags: string;
  feeStrategy: number;
  optical: string;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  firstBuyAmount: string;
}

interface OpticalOption {
  address: string;
  name: string;
  description: string;
  riskLevel: number | null;
  auditor: string;
}

const STEPS = ['Token Details', 'Socials', 'Images', 'Review & Deploy'] as const;
const FEE_STRATEGIES = [
  { value: 0, label: 'Standard (1%)' },
  { value: 1, label: 'Low (0.5%)' },
  { value: 2, label: 'High (2%)' },
] as const;

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const MAX_BANNER_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = '.webp,.png,.svg';

async function uploadMetadataUnified(
  address: string,
  tokenAddress: string,
  form: WizardFormData,
  logoFile: File | null,
  bannerFile: File | null,
) {
  const body = new FormData();
  body.append('wallet', address);

  const metadataJson: Record<string, any> = {};
  if (form.name) metadataJson.name = form.name;
  if (form.symbol) metadataJson.symbol = form.symbol;
  if (form.description) metadataJson.description = form.description;
  if (form.website) metadataJson.website = form.website;
  if (form.twitter) metadataJson.twitter = form.twitter;
  if (form.telegram) metadataJson.telegram = form.telegram;
  if (form.discord) metadataJson.discord = form.discord;
  if (form.customTags) {
    metadataJson.tags = form.customTags.split(',').map((t) => t.trim()).filter(Boolean);
  }

  if (Object.keys(metadataJson).length > 0) {
    body.append('metadata', JSON.stringify(metadataJson));
  }

  if (logoFile) body.append('logo', logoFile);
  if (bannerFile) body.append('banner', bannerFile);

  const res = await fetch(`${sdkBaseUrls.metadata}/metadata/${tokenAddress}`, {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Metadata upload failed: ${res.status} ${err}`);
  }

  return res.json();
}

export default function CreateWizard() {
  const { address } = useAccount();
  const nav = useRouter();
  const publicClient = usePublicClient();
  const [step, setStep] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [form, setForm] = useState<WizardFormData>({
    name: '', symbol: '', description: '', customTags: '',
    feeStrategy: 0, optical: zeroAddress,
    website: '', twitter: '', telegram: '', discord: '',
    firstBuyAmount: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const { data: opticals } = useReadOpticalRegistryGetAllOpticals({ offset: 0n, limit: 20n });
  const opticalAddresses = useMemo(
    () => (Array.isArray(opticals) ? (opticals as string[]) : []),
    [opticals],
  );

  const { data: opticalMetadataResults } = useReadContracts({
    contracts: opticalAddresses.map((optical) => ({
      address: OPTICAL_REGISTRY_ADDRESS,
      abi: OpticalRegistryAbi as any,
      functionName: 'getOpticalMetadata',
      args: [optical as `0x${string}`],
    })),
    query: { enabled: opticalAddresses.length > 0 },
  });

  const opticalOptions = useMemo<OpticalOption[]>(
    () => opticalAddresses.map((addr, i) => {
      const raw = opticalMetadataResults?.[i]?.result as any;
      const name = typeof raw?.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : `Optical ${i + 1}`;
      const description = typeof raw?.description === 'string' ? raw.description.trim() : '';
      const riskLevel = raw?.riskLevel !== undefined && raw?.riskLevel !== null
        ? Number(raw.riskLevel)
        : null;
      const auditor = typeof raw?.auditor === 'string' ? raw.auditor.trim() : '';

      return { address: addr, name, description, riskLevel, auditor };
    }),
    [opticalAddresses, opticalMetadataResults],
  );
  const selectedOptical = opticalOptions.find((o) => o.address.toLowerCase() === form.optical.toLowerCase()) ?? null;
  const { data: creationFee } = useReadCreationFee();
  const { data: currentAllowance, refetch: refetchAllowance } = useReadErc20Allowance({
    token: USDL_ADDRESS,
    owner: (address || zeroAddress) as `0x${string}`,
    spender: ROUTER_ADDRESS,
  });

  const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
  const { write: writeCreateMarket, isPending: createPending, data: createTxHash } = useWriteRouterCreateMarket();
  const { write: writeBuy, isPending: buyPending } = useWriteRouterBuy();

  const { data: usdlDecimalsRaw } = useReadErc20Decimals({ token: USDL_ADDRESS });
  const usdlDecimals = usdlDecimalsRaw !== undefined && usdlDecimalsRaw !== null
    ? Number(usdlDecimalsRaw)
    : 18;

  const hasFirstBuy = form.firstBuyAmount && parseFloat(form.firstBuyAmount) > 0;

  const creationFeeDisplay = creationFee
    ? `${formatUnits(BigInt(String(creationFee)), usdlDecimals)} USDL`
    : '...';

  const needsApproval = (() => {
    if (!creationFee || !currentAllowance) return true;
    const fee = BigInt(String(creationFee));
    const allowance = BigInt(String(currentAllowance));
    const buyExtra = hasFirstBuy ? parseUnits(form.firstBuyAmount, usdlDecimals) : 0n;
    return allowance < fee + buyExtra;
  })();

  const { receipt: createReceipt, isOptimistic: createIsOptimistic } = useOptimisticReceipt(createTxHash);
  const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);

  // Once the USDL approval confirms (or the optimistic fallback fires for nodes
  // that swallow receipts), refresh the allowance and immediately proceed to
  // createMarket. Without this the wizard stalls after step 1 because the
  // allowance read never refetches and `deploying` stays true.
  const approveHandledRef = useRef(false);
  useEffect(() => {
    if (!approveReceipt || approveHandledRef.current) return;
    approveHandledRef.current = true;
    void refetchAllowance();
    const optical = (form.optical || zeroAddress) as `0x${string}`;
    writeCreateMarket({
      name: form.name,
      symbol: form.symbol,
      feeStrategy: form.feeStrategy,
      optical,
    });
  }, [approveReceipt, refetchAllowance, writeCreateMarket, form.optical, form.name, form.symbol, form.feeStrategy]);

  const metadataUploadedRef = useRef(false);

  if (createReceipt && !metadataUploadedRef.current && publicClient) {
    metadataUploadedRef.current = true;

    (async () => {
      // Nodes on this chain don't return receipts for successful txs, so we
      // can't read logs from the receipt. Instead, query eth_getLogs directly
      // for the MarketCreated event filtered by creator.
      let poolAddr = '';
      let tokenAddr = '';
      try {
        const marketCreatedAbi = (RouterAbi as any[]).find(
          (x) => x.name === 'MarketCreated' && x.type === 'event',
        );
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock > 50n ? latestBlock - 50n : 0n;
        const logs = await publicClient.getLogs({
          address: ROUTER_ADDRESS as `0x${string}`,
          event: marketCreatedAbi,
          args: { creator: address as `0x${string}` },
          fromBlock,
          toBlock: 'latest',
        });
        const last = logs[logs.length - 1] as any;
        if (last) {
          poolAddr = last.args?.pool ?? '';
          tokenAddr = last.args?.token ?? '';
        }
      } catch (err) {
        console.error('getLogs for MarketCreated failed:', err);
      }

      if (poolAddr && tokenAddr) {
        try {
          const hasMetadata = form.description || form.website || form.twitter || form.telegram || form.discord || form.customTags || form.name || form.symbol;
          if (hasMetadata || logoFile || bannerFile) {
            await uploadMetadataUnified(address!, tokenAddr, form, logoFile, bannerFile);
          }
        } catch (err) {
          console.error('Metadata upload failed:', err);
        }

        if (hasFirstBuy) {
          const buyAmount = parseUnits(form.firstBuyAmount, usdlDecimals);
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
          // P0-1: First buy into creator's own fresh pool. Proper quote-based
          // minTokensOut requires waiting for pool indexing (P1 scope). Using
          // 1n as floor to block zero-output trades; the bonding curve price
          // on a new pool is deterministic so sandwich risk is minimal.
          writeBuy({ pool: poolAddr as `0x${string}`, usdlAmountIn: buyAmount, minTokensOut: 1n, deadline });
        }

        nav.push(`/token/${poolAddr}`);
      }
    })();
  }

  const update = <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'logo' | 'banner',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = type === 'logo' ? MAX_LOGO_SIZE : MAX_BANNER_SIZE;
    const setError = type === 'logo' ? setLogoError : setBannerError;
    const setFile = type === 'logo' ? setLogoFile : setBannerFile;
    const setPreview = type === 'logo' ? setLogoPreview : setBannerPreview;

    if (file.size > maxSize) {
      setError(`File exceeds ${type === 'logo' ? '2MB' : '5MB'} limit`);
      return;
    }
    setError(null);
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const next = () => setStep((s) => Math.min(s + 1, 3));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const canDeploy = form.name.length >= 1 && form.symbol.length >= 1;

  const handleDeploy = useCallback(async () => {
    if (!canDeploy || !address) return;
    setDeploying(true);
    setDeployError(null);
    approveHandledRef.current = false;

    try {
      if (needsApproval) {
        const fee = creationFee ? BigInt(String(creationFee)) : 0n;
        const buyExtra = hasFirstBuy ? parseUnits(form.firstBuyAmount, usdlDecimals) : 0n;
        writeApprove({ token: USDL_ADDRESS, spender: ROUTER_ADDRESS, amount: fee + buyExtra });
        return;
      }

      const optical = (form.optical || zeroAddress) as `0x${string}`;

      writeCreateMarket({
        name: form.name,
        symbol: form.symbol,
        feeStrategy: form.feeStrategy,
        optical,
      });
    } catch (err: any) {
      setDeployError(err?.message || 'Transaction failed');
      setDeploying(false);
    }
  }, [form, address, canDeploy, needsApproval, writeApprove, writeCreateMarket]);

  const isPending = approvePending || createPending || buyPending || deploying;

  const inputClass = 'w-full bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-13 text-white outline-none focus:border-pink-middle transition';
  const labelClass = 'text-size-11 text-dark-disabled mb-1 block';

  return (
    <div className="max-w-2xl mx-auto p-4 text-white">
      <h1 className="text-size-16 font-manrope-bold mb-1">Create Token</h1>
      <p className="text-size-12 text-dark-disabled mb-5">Launch a new token and pool on Paxeer Network</p>

      <div className="flex gap-2 mb-6">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => i < step && setStep(i)} className="flex-1 text-left">
            <div className={`h-1 rounded-full transition ${i <= step ? 'bg-pink-middle' : 'bg-dark-gray'}`} />
            <span className={`text-size-9 mt-1 block ${i === step ? 'text-pink-middle font-manrope-bold' : i < step ? 'text-half-enabled' : 'text-dark-disabled'}`}>
              {i + 1}. {s}
            </span>
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Token Name *</label>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="My Token" maxLength={50} />
          </div>
          <div>
            <label className={labelClass}>Symbol *</label>
            <input value={form.symbol} onChange={(e) => update('symbol', e.target.value.toUpperCase())} className={inputClass} placeholder="TKN" maxLength={10} />
            <span className="text-size-9 text-dark-disabled mt-0.5 block">{form.symbol.length}/10 characters</span>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} h-24 resize-none`} placeholder="What is this token about?" maxLength={500} />
            <span className="text-size-9 text-dark-disabled mt-0.5 block">{form.description.length}/500</span>
          </div>
          <div>
            <label className={labelClass}>Custom Tags</label>
            <input value={form.customTags} onChange={(e) => update('customTags', e.target.value)} className={inputClass} placeholder="meme, ai, defi (comma separated)" />
          </div>
          <div>
            <label className={labelClass}>Fee Strategy</label>
            <div className="flex gap-2">
              {FEE_STRATEGIES.map((fs) => (
                <button
                  key={fs.value}
                  onClick={() => update('feeStrategy', fs.value)}
                  className={`flex-1 py-2 rounded-lg text-size-12 font-manrope-bold border transition ${
                    form.feeStrategy === fs.value
                      ? 'border-pink-middle bg-pink-opacity-1 text-pink-middle'
                      : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                  }`}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Optical (Token Mechanic)</label>
            <select
              value={form.optical}
              onChange={(e) => update('optical', e.target.value)}
              className={inputClass}
            >
              <option value={zeroAddress}>None (standard bonding curve)</option>
              {opticalOptions.map((optical) => (
                <option key={optical.address} value={optical.address}>
                  {optical.name}
                  {optical.riskLevel !== null ? ` • Risk ${optical.riskLevel}` : ''}
                  {optical.auditor ? ` • ${optical.auditor}` : ''}
                </option>
              ))}
            </select>
            {form.optical !== zeroAddress && selectedOptical && (
              <div className="mt-2 rounded-lg border border-dark-gray bg-dark-gray2/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-size-12 font-manrope-bold text-white">{selectedOptical.name}</span>
                  {selectedOptical.riskLevel !== null && (
                    <span className="text-size-10 text-dark-disabled">Risk level: {selectedOptical.riskLevel}</span>
                  )}
                </div>
                {selectedOptical.description && (
                  <p className="text-size-11 text-dark-disabled mt-1">{selectedOptical.description}</p>
                )}
                <p className="text-size-10 text-dark-disabled mt-1 font-mono">
                  {selectedOptical.address}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div><label className={labelClass}>Website</label><input value={form.website} onChange={(e) => update('website', e.target.value)} className={inputClass} placeholder="https://..." /></div>
          <div><label className={labelClass}>Twitter</label><input value={form.twitter} onChange={(e) => update('twitter', e.target.value)} className={inputClass} placeholder="@handle" /></div>
          <div><label className={labelClass}>Telegram</label><input value={form.telegram} onChange={(e) => update('telegram', e.target.value)} className={inputClass} placeholder="https://t.me/..." /></div>
          <div><label className={labelClass}>Discord</label><input value={form.discord} onChange={(e) => update('discord', e.target.value)} className={inputClass} placeholder="https://discord.gg/..." /></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className={labelClass}>Token Logo (max 2MB, webp/png/svg)</label>
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full bg-dark-gray flex items-center justify-center overflow-hidden flex-shrink-0 border border-dark-gray">
                {logoPreview ? (
                  <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-dark-disabled text-size-11">{form.symbol || 'Logo'}</span>
                )}
              </div>
              <div className="flex-1">
                <input type="file" accept={ACCEPTED_IMAGE_TYPES} onChange={(e) => handleFileSelect(e, 'logo')} className="text-size-11 text-dark-disabled" />
                {logoError && <span className="text-red-middle text-size-10 block mt-1">{logoError}</span>}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Banner Image (max 5MB, webp/png/svg)</label>
            <div className="border border-dark-gray rounded-lg overflow-hidden">
              {bannerPreview ? (
                <img src={bannerPreview} alt="banner" className="w-full h-32 object-cover" />
              ) : (
                <div className="w-full h-32 bg-dark-gray flex items-center justify-center text-dark-disabled text-size-12">
                  No banner uploaded
                </div>
              )}
            </div>
            <input type="file" accept={ACCEPTED_IMAGE_TYPES} onChange={(e) => handleFileSelect(e, 'banner')} className="text-size-11 text-dark-disabled mt-2" />
            {bannerError && <span className="text-red-middle text-size-10 block mt-1">{bannerError}</span>}
          </div>

          <div className="border border-dark-gray rounded-lg p-3">
            <span className="text-size-11 text-dark-disabled mb-2 block">Live Preview</span>
            <div className="flex items-center gap-3 p-2 bg-gradient-black-gray rounded-lg">
              <div className="w-10 h-10 rounded-full bg-dark-gray overflow-hidden flex-shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-dark-disabled text-size-9">
                    {form.symbol?.slice(0, 2) || '??'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-size-12 font-manrope-bold">{form.symbol || 'TKN'}</span>
                  <span className="text-size-10 text-dark-disabled truncate">{form.name || 'Token Name'}</span>
                </div>
                <div className="flex gap-2 text-size-10 text-dark-disabled mt-0.5">
                  <span>MC: $0.00</span>
                  <span>Vol: $0.00</span>
                </div>
              </div>
              <span className="text-green-middle text-size-11 font-manrope-bold">New</span>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="border border-dark-gray rounded-lg p-4 space-y-3">
            <h3 className="text-size-14 font-manrope-bold">Summary</h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-size-12">
              <span className="text-dark-disabled">Name:</span><span>{form.name}</span>
              <span className="text-dark-disabled">Symbol:</span><span>{form.symbol}</span>
              <span className="text-dark-disabled">Fee Strategy:</span><span>{FEE_STRATEGIES.find((f) => f.value === form.feeStrategy)?.label}</span>
              <span className="text-dark-disabled">Optical:</span>
              <span className="truncate">
                {form.optical === zeroAddress
                  ? 'None'
                  : selectedOptical
                    ? `${selectedOptical.name}${selectedOptical.riskLevel !== null ? ` (Risk ${selectedOptical.riskLevel})` : ''}`
                    : `${form.optical.slice(0, 10)}...`}
              </span>
              {form.customTags && <><span className="text-dark-disabled">Tags:</span><span>{form.customTags}</span></>}
              {form.website && <><span className="text-dark-disabled">Website:</span><span className="truncate">{form.website}</span></>}
              {form.twitter && <><span className="text-dark-disabled">Twitter:</span><span>{form.twitter}</span></>}
              {form.telegram && <><span className="text-dark-disabled">Telegram:</span><span className="truncate">{form.telegram}</span></>}
              {form.discord && <><span className="text-dark-disabled">Discord:</span><span className="truncate">{form.discord}</span></>}
              <span className="text-dark-disabled">Logo:</span><span>{logoFile ? logoFile.name : 'None'}</span>
              <span className="text-dark-disabled">Banner:</span><span>{bannerFile ? bannerFile.name : 'None'}</span>
            </div>
            {form.description && (
              <div className="border-t border-dark-gray pt-2 mt-2">
                <span className="text-dark-disabled text-size-11">Description:</span>
                <p className="text-size-12 mt-1">{form.description}</p>
              </div>
            )}
          </div>

          <div className="border border-dark-gray rounded-lg p-4 space-y-3">
            <h3 className="text-size-13 font-manrope-bold">First Buy (optional)</h3>
            <p className="text-size-11 text-dark-disabled">
              Bundle a buy with your token creation in a single transaction.
            </p>
            <div>
              <label className={labelClass}>USDL Amount</label>
              <input
                type="number"
                value={form.firstBuyAmount}
                onChange={(e) => update('firstBuyAmount', e.target.value)}
                className={inputClass}
                placeholder="0.00"
                min="0"
                step="any"
              />
            </div>
            <div className="flex gap-2">
              {['10', '50', '100', '500'].map((amt) => (
                <button
                  key={amt}
                  onClick={() => update('firstBuyAmount', amt)}
                  className={`flex-1 py-1 rounded border text-size-10 transition ${
                    form.firstBuyAmount === amt
                      ? 'border-pink-middle text-pink-middle'
                      : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                  }`}
                >
                  {amt} USDL
                </button>
              ))}
            </div>
          </div>

          <div className="border border-dark-gray rounded-lg p-3 bg-dark-gray2/50 space-y-1">
            <div className="flex justify-between text-size-11">
              <span className="text-dark-disabled">Creation fee:</span>
              <span className="text-half-enabled">{creationFeeDisplay}</span>
            </div>
            {needsApproval && (
              <div className="flex justify-between text-size-11">
                <span className="text-dark-disabled">Step 1:</span>
                <span className="text-yellow-middle">Approve USDL spending</span>
              </div>
            )}
            <div className="flex justify-between text-size-11">
              <span className="text-dark-disabled">{needsApproval ? 'Step 2:' : 'Transaction:'}</span>
              <span className="text-half-enabled">createMarket</span>
            </div>
            {hasFirstBuy && (
              <div className="flex justify-between text-size-11">
                <span className="text-dark-disabled">{needsApproval ? 'Step 3:' : 'Step 2:'}</span>
                <span className="text-green-middle">Buy {form.firstBuyAmount} USDL (after creation)</span>
              </div>
            )}
          </div>

          {deployError && (
            <div className="border border-red-middle/40 rounded-lg p-3 bg-red-opacity-005 text-red-middle text-size-12">
              {deployError}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <button
            onClick={prev}
            disabled={isPending}
            className="px-4 py-2.5 rounded-lg border border-dark-gray text-size-12 text-half-enabled hover:bg-dark-gray2 transition disabled:opacity-40"
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={next}
            disabled={step === 0 && (!form.name || !form.symbol)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-pink-opacity-1 border border-pink-middle/40 text-pink-middle text-size-12 font-manrope-bold hover:bg-pink-middle/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleDeploy}
            disabled={!canDeploy || isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-pink-middle text-black text-size-13 font-manrope-bold hover:bg-pink-middle2 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {approvePending ? 'Approving...' : createPending ? 'Creating...' : buyPending ? 'Buying...' : needsApproval ? 'Approve USDL' : hasFirstBuy ? 'Deploy + Buy' : 'Deploy Token'}
          </button>
        )}
      </div>
    </div>
  );
}
