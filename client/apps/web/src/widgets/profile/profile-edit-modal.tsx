'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useSignMessage } from 'wagmi';
import { sdkBaseUrls } from '@/core/sdk-config';
import { CountrySelectDialog } from '@/new-components/CountrySelectDialog';

type Country = { name: string; code: string; flag: string };

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: {
    displayName: string;
    bio: string;
    twitter: string;
    telegram: string;
    discord: string;
    website: string;
    avatarUrl: string | null;
  };
}

type Step = 'form' | 'signing' | 'uploading' | 'done' | 'error';

export default function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [twitter, setTwitter] = useState(initial.twitter);
  const [telegram, setTelegram] = useState(initial.telegram);
  const [discord, setDiscord] = useState(initial.discord);
  const [website, setWebsite] = useState(initial.website);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatarUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [country, setCountry] = useState<Country | null>(null);
  const [showCountry, setShowCountry] = useState(false);

  useEffect(() => {
    setDisplayName(initial.displayName);
    setBio(initial.bio);
    setTwitter(initial.twitter);
    setTelegram(initial.telegram);
    setDiscord(initial.discord);
    setWebsite(initial.website);
    setAvatarPreview(initial.avatarUrl);
    setAvatarFile(null);
    setStep('form');
    setErrorMsg('');
  }, [initial, open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('File too large. Max 2MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['webp', 'png', 'svg'].includes(ext || '')) {
      setErrorMsg('Unsupported format. Use webp, png, or svg.');
      return;
    }
    setErrorMsg('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!address) return;
    setStep('signing');
    setErrorMsg('');

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `Update profile for ${address} at ${timestamp}`;
      const signature = await signMessageAsync({ message });

      setStep('uploading');

      // Upload avatar if changed
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);

        const avatarRes = await fetch(
          `${sdkBaseUrls.users}/users/${address}/avatar`,
          {
            method: 'POST',
            headers: {
              'x-signature': signature,
              'x-message': message,
            },
            body: formData,
          },
        );

        if (!avatarRes.ok) {
          const err = await avatarRes.json().catch(() => ({ error: 'Avatar upload failed' }));
          throw new Error(err.error || 'Avatar upload failed');
        }
      }

      // Update profile text fields
      const profileRes = await fetch(
        `${sdkBaseUrls.users}/users/${address}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              displayName: displayName.trim() || undefined,
              bio: bio.trim() || undefined,
              twitter: twitter.trim() || undefined,
              telegram: telegram.trim() || undefined,
              discord: discord.trim() || undefined,
              website: website.trim() || undefined,
            },
            signature,
            message,
          }),
        },
      );

      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({ error: 'Profile update failed' }));
        throw new Error(err.error || 'Profile update failed');
      }

      setStep('done');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch (e: any) {
      if (e?.message?.includes('User rejected') || e?.message?.includes('denied')) {
        setStep('form');
        return;
      }
      setErrorMsg(e?.message || 'Something went wrong');
      setStep('error');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-full max-w-md mx-4 bg-[#0B0E18] border border-dark-gray rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-gray">
          <h2 className="text-size-14 font-manrope-bold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-dark-disabled hover:text-half-enabled transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-xl bg-dark-gray flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition relative group"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-dark-gray6 font-manrope-extra-bold text-size-16">
                  {address?.slice(2, 4).toUpperCase() || '??'}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-size-11 font-manrope-bold text-green-middle hover:text-green-middle2 transition"
              >
                Change photo
              </button>
              <p className="text-size-9 text-dark-disabled mt-0.5">Max 2MB. webp, png, svg.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".webp,.png,.svg"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="text-size-10 text-dark-disabled block mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Enter a display name"
              maxLength={32}
              className="w-full bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-white outline-none focus:border-pink-middle transition"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="text-size-10 text-dark-disabled block mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell us about yourself"
              maxLength={160}
              rows={3}
              className="w-full bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-white outline-none focus:border-pink-middle transition resize-none"
            />
            <span className="text-size-9 text-dark-disabled float-right">{bio.length}/160</span>
          </div>

          {/* Socials */}
          <div className="space-y-3">
            <p className="text-size-10 text-dark-disabled">Socials</p>

            <div className="flex items-center gap-2">
              <div className="w-8 flex-shrink-0 flex justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-half-enabled"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </div>
              <input
                type="text"
                value={twitter}
                onChange={e => setTwitter(e.target.value)}
                placeholder="@username"
                className="flex-1 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-1.5 text-size-11 text-white outline-none focus:border-pink-middle transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 flex-shrink-0 flex justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-half-enabled"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </div>
              <input
                type="text"
                value={telegram}
                onChange={e => setTelegram(e.target.value)}
                placeholder="t.me/username or @username"
                className="flex-1 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-1.5 text-size-11 text-white outline-none focus:border-pink-middle transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 flex-shrink-0 flex justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-half-enabled"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/></svg>
              </div>
              <input
                type="text"
                value={discord}
                onChange={e => setDiscord(e.target.value)}
                placeholder="username#1234"
                className="flex-1 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-1.5 text-size-11 text-white outline-none focus:border-pink-middle transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 flex-shrink-0 flex justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-half-enabled"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <input
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://yoursite.com"
                className="flex-1 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-1.5 text-size-11 text-white outline-none focus:border-pink-middle transition"
              />
            </div>
          </div>

          {/* Region */}
          <div>
            <label className="text-size-10 text-dark-disabled block mb-1">Region</label>
            <button
              type="button"
              onClick={() => setShowCountry(true)}
              className="w-full bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-left outline-none hover:border-dark-gray6 transition flex items-center justify-between"
            >
              {country ? (
                <span className="flex items-center gap-2">
                  <span className="text-lg">{country.flag}</span>
                  <span className="text-white">{country.name}</span>
                </span>
              ) : (
                <span className="text-dark-disabled">Select region</span>
              )}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-dark-disabled flex-shrink-0"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <CountrySelectDialog
            isOpen={showCountry}
            onClose={() => setShowCountry(false)}
            onSelectCountry={(c: Country) => { setCountry(c); setShowCountry(false); }}
            selectedCountry={country}
          />

          {/* Error */}
          {errorMsg && (
            <div className="text-red-middle text-size-11 text-center py-1">{errorMsg}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-dark-gray flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={step === 'signing' || step === 'uploading'}
            className="flex-1 py-2.5 rounded-lg border border-dark-gray text-size-12 font-manrope-bold text-half-enabled hover:text-white hover:border-half-enabled transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={step === 'signing' || step === 'uploading' || step === 'done'}
            className="flex-1 py-2.5 rounded-lg bg-green-middle text-black text-size-12 font-manrope-bold hover:bg-green-middle2 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'signing' ? 'Sign in wallet...' :
             step === 'uploading' ? 'Saving...' :
             step === 'done' ? 'Saved' :
             step === 'error' ? 'Retry' :
             'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
