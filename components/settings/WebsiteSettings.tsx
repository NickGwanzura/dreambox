import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Globe,
  Image,
  Upload,
  X,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  Loader2,
  AlertTriangle,
  LayoutTemplate,
  Users2,
  MoveUp,
  MoveDown,
  GalleryHorizontal,
} from 'lucide-react';
import { getToken } from '../../services/apiClient';
import { updateLocalCompanyProfile } from '../../services/mockData';

export type PartnerLogo = { name: string; src: string };
export type GalleryImage = { src: string };

// No hardcoded demo logos — "reset" clears to empty rather than repopulating
// with placeholder brand logos that were never real clients or endorsements.
const FALLBACK_LOGOS: PartnerLogo[] = [];

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function uploadToR2WithFolder(dataUrl: string, folder: string): Promise<string> {
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ dataUrl, folder }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const { url } = await res.json();
  return url;
}

async function uploadToR2(dataUrl: string): Promise<string> {
  return uploadToR2WithFolder(dataUrl, 'logos');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isDataUrl(s: string) {
  return s.startsWith('data:');
}

// Mirrors the server's ALLOWED_MIME_TYPES / MAX_UPLOAD_BYTES in lib/uploadBase64.ts —
// reject unsupported types and oversized files before spending time on an upload
// that the server will reject anyway.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type || 'unknown'}. Use JPEG, PNG, WebP, GIF, or SVG.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed is 5 MB.`;
  }
  return null;
}

export const WebsiteSettings: React.FC = () => {
  // ── Hero image ───────────────────────────────────────────────────────────
  const [heroUrl, setHeroUrl] = useState<string>('');           // saved R2 URL
  const [heroPreview, setHeroPreview] = useState<string>('');   // local base64 or saved URL
  const [heroSaving, setHeroSaving] = useState(false);
  const [heroStatus, setHeroStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [heroError, setHeroError] = useState('');
  const heroInputRef = useRef<HTMLInputElement>(null);

  // ── Partner logos ────────────────────────────────────────────────────────
  const [logos, setLogos] = useState<PartnerLogo[]>([]);
  const [logosSaving, setLogosSaving] = useState(false);
  const [logosStatus, setLogosStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [logosError, setLogosError] = useState('');
  // New-logo form
  const [addName, setAddName] = useState('');
  const [addPreview, setAddPreview] = useState('');
  const [addUploading, setAddUploading] = useState(false);
  const [addError, setAddError] = useState('');
  const addFileRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // ── Per-logo replace input refs ──────────────────────────────────────────
  const replaceRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // ── Campaign gallery ──────────────────────────────────────────────────────
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryStatus, setGalleryStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [galleryError, setGalleryError] = useState('');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/company-profile', {
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
        if (res.ok) {
          const data = await res.json();
          const savedHero = data.heroImageUrl || '';
          setHeroUrl(savedHero);
          setHeroPreview(savedHero);
          if (data.partnerLogos) {
            try { setLogos(JSON.parse(data.partnerLogos)); } catch {}
          } else {
            setLogos(FALLBACK_LOGOS);
          }
          if (data.campaignGallery) {
            try { setGallery(JSON.parse(data.campaignGallery)); } catch {}
          }
        }
      } catch {}
    })();
  }, []);

  // ── Hero handlers ─────────────────────────────────────────────────────────
  const handleHeroFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setHeroError(err); setHeroStatus('error'); e.target.value = ''; return; }
    setHeroError('');
    setHeroStatus('idle');
    const dataUrl = await readFileAsDataUrl(file);
    setHeroPreview(dataUrl);
    e.target.value = '';
  };

  const handleHeroDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setHeroError(err); setHeroStatus('error'); return; }
    setHeroError('');
    setHeroStatus('idle');
    const dataUrl = await readFileAsDataUrl(file);
    setHeroPreview(dataUrl);
  }, []);

  const saveHero = async () => {
    setHeroSaving(true);
    setHeroStatus('idle');
    setHeroError('');
    try {
      // Send only the changed field — Prisma treats an absent key as "don't
      // touch this column", so this can't clobber a concurrent edit to
      // another section (partner logos, gallery, bank details, ...).
      const res = await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ heroImageUrl: heroPreview || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const saved = await res.json();
      const savedUrl = saved.heroImageUrl || '';
      setHeroUrl(savedUrl);
      setHeroPreview(savedUrl);
      setHeroStatus('saved');
      // Sync back to mockData so PublicWebsite and other components see the update immediately
      updateLocalCompanyProfile({ heroImageUrl: savedUrl || null });
      setTimeout(() => setHeroStatus('idle'), 3000);
    } catch (e: any) {
      setHeroError(e.message || 'Save failed');
      setHeroStatus('error');
    } finally {
      setHeroSaving(false);
    }
  };

  const clearHero = () => {
    setHeroPreview('');
    setHeroStatus('idle');
    setHeroError('');
  };

  // ── Partner logo handlers ─────────────────────────────────────────────────
  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateImageFile(file);
    if (validationErr) { setAddError(validationErr); e.target.value = ''; return; }
    setAddError('');
    setAddUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const url = await uploadToR2(dataUrl);
      setAddPreview(url);
    } catch (err: any) {
      // Surface the failure rather than falling back to a raw data URL —
      // that used to silently embed megabytes of base64 into the saved
      // profile whenever R2 rejected or was unreachable.
      setAddError(err.message || 'Upload failed. Please try again.');
    } finally {
      setAddUploading(false);
    }
    e.target.value = '';
  };

  const confirmAddLogo = () => {
    if (!addName.trim() || !addPreview) return;
    setLogos(prev => [...prev, { name: addName.trim(), src: addPreview }]);
    setAddName('');
    setAddPreview('');
    setAddError('');
    setShowAddForm(false);
  };

  const removeLogo = (index: number) => {
    setLogos(prev => prev.filter((_, i) => i !== index));
  };

  const moveLogo = (index: number, dir: -1 | 1) => {
    setLogos(prev => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  };

  const handleReplaceFile = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateImageFile(file);
    if (validationErr) { setLogosError(validationErr); setLogosStatus('error'); e.target.value = ''; return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const url = await uploadToR2(dataUrl);
      setLogos(prev => prev.map((l, i) => i === index ? { ...l, src: url } : l));
    } catch (err: any) {
      setLogosError(err.message || 'Upload failed. Please try again.');
      setLogosStatus('error');
    }
    e.target.value = '';
  };

  const saveLogos = async () => {
    setLogosSaving(true);
    setLogosStatus('idle');
    setLogosError('');
    try {
      // Send only the changed field — see saveHero for why.
      const res = await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ partnerLogos: JSON.stringify(logos) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setLogosStatus('saved');
      // Sync back to mockData so PublicWebsite and other components see the update immediately
      updateLocalCompanyProfile({ partnerLogos: JSON.stringify(logos) });
      setTimeout(() => setLogosStatus('idle'), 3000);
    } catch (e: any) {
      setLogosError(e.message || 'Save failed');
      setLogosStatus('error');
    } finally {
      setLogosSaving(false);
    }
  };

  const resetLogos = () => {
    setLogos(FALLBACK_LOGOS);
    setLogosStatus('idle');
    setLogosError('');
  };

  // ── Gallery handlers ──────────────────────────────────────────────────────
  const uploadGalleryFiles = async (files: File[]): Promise<{ uploaded: GalleryImage[]; errors: string[] }> => {
    const uploaded: GalleryImage[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const validationErr = validateImageFile(file);
      if (validationErr) { errors.push(`${file.name}: ${validationErr}`); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const url = await uploadToR2WithFolder(dataUrl, 'gallery');
        uploaded.push({ src: url });
      } catch (err: any) {
        // Surface the failure instead of embedding raw base64 — a fallback
        // here previously let multi-MB inline images into the saved profile.
        errors.push(`${file.name}: ${err.message || 'Upload failed'}`);
      }
    }
    return { uploaded, errors };
  };

  const handleGalleryFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setGalleryUploading(true);
    setGalleryError('');
    setGalleryStatus('idle');
    const { uploaded, errors } = await uploadGalleryFiles(files);
    setGallery(prev => [...prev, ...uploaded]);
    // Surface upload failures (validation, R2 unreachable, ...) — the banner
    // only renders when galleryStatus is 'error', so previously these were
    // collected but never displayed and the photos just silently vanished.
    if (errors.length) {
      setGalleryError(errors.join('; '));
      setGalleryStatus('error');
    }
    setGalleryUploading(false);
    e.target.value = '';
  };

  const handleGalleryDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    setGalleryUploading(true);
    setGalleryError('');
    setGalleryStatus('idle');
    const { uploaded, errors } = await uploadGalleryFiles(files);
    setGallery(prev => [...prev, ...uploaded]);
    if (errors.length) {
      setGalleryError(errors.join('; '));
      setGalleryStatus('error');
    }
    setGalleryUploading(false);
  }, []);

  const removeGalleryImage = (index: number) => {
    setGallery(prev => prev.filter((_, i) => i !== index));
  };

  const saveGallery = async () => {
    setGallerySaving(true);
    setGalleryStatus('idle');
    setGalleryError('');
    try {
      // Send only the changed field — see saveHero for why.
      const res = await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ campaignGallery: JSON.stringify(gallery) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setGalleryStatus('saved');
      updateLocalCompanyProfile({ campaignGallery: JSON.stringify(gallery) } as any);
      setTimeout(() => setGalleryStatus('idle'), 3000);
    } catch (e: any) {
      setGalleryError(e.message || 'Save failed');
      setGalleryStatus('error');
    } finally {
      setGallerySaving(false);
    }
  };

  const heroChanged = heroPreview !== heroUrl;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-50 rounded-xl"><Globe className="w-6 h-6 text-indigo-600" /></div>
        <div>
          <h3 className="text-xl font-bold text-slate-800">Website Content</h3>
          <p className="text-xs text-slate-500 mt-0.5">Manage public-facing images — hero background and partner logos</p>
        </div>
      </div>

      {/* ── Hero Image ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm border border-slate-100">
            <LayoutTemplate size={18} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Hero Background Image</h4>
            <p className="text-xs text-slate-500">Displays as the homepage hero backdrop. If empty, the site uses a depth gradient.</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleHeroDrop}
            onClick={() => heroInputRef.current?.click()}
            className="relative cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors overflow-hidden"
            style={{ minHeight: 200 }}
          >
            {heroPreview ? (
              <img
                src={heroPreview}
                alt="Hero preview"
                className="w-full h-52 object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-52 gap-3 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-full"><Image size={28} /></div>
                <p className="text-sm font-semibold">Drop image here or click to upload</p>
                <p className="text-xs">PNG, JPG, WebP — max 5 MB</p>
              </div>
            )}
            {heroPreview && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
                <div className="bg-white/90 px-4 py-2 rounded-lg text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Upload size={15} /> Replace Image
                </div>
              </div>
            )}
          </div>
          <input ref={heroInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeroFile} />

          {/* Status / URL */}
          {heroUrl && !isDataUrl(heroUrl) && (
            <p className="text-xs text-slate-500 font-mono truncate">Current: {heroUrl}</p>
          )}
          {!heroUrl && !heroPreview && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <CheckCircle size={13} className="text-indigo-400 shrink-0" />
              No hero image set — the depth gradient is displayed on the public site.
            </div>
          )}

          {/* Error */}
          {heroStatus === 'error' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} /> {heroError || 'Save failed'}
            </div>
          )}
          {heroStatus === 'saved' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={13} /> Hero image saved successfully.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => heroInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Upload size={14} /> Upload Image
            </button>
            {heroPreview && (
              <button
                type="button"
                onClick={clearHero}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-colors"
              >
                <X size={14} /> Clear
              </button>
            )}
            <button
              type="button"
              onClick={saveHero}
              disabled={heroSaving || (!heroChanged && heroStatus !== 'idle')}
              className={`ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 ${
                heroChanged
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {heroSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {heroSaving ? 'Saving…' : heroChanged ? 'Save New Image' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Partner Logos ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm border border-slate-100">
              <Users2 size={18} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Partner / Client Logos</h4>
              <p className="text-xs text-slate-500">Displayed in the Partners section on the homepage. Drag to reorder.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetLogos}
              className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Reset to Default
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(v => !v); setAddError(''); }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              <Plus size={14} /> Add Logo
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Add logo form */}
          {showAddForm && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold text-indigo-800 uppercase tracking-wider">New Partner Logo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company name</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. Econet Wireless"
                    className="w-full px-3 py-2.5 border border-indigo-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Logo image</label>
                  <div
                    className="relative flex items-center gap-3 px-3 py-2 border border-indigo-200 rounded-xl bg-white cursor-pointer hover:border-indigo-400 transition-colors"
                    onClick={() => addFileRef.current?.click()}
                  >
                    {addPreview ? (
                      <img src={addPreview} alt="preview" className="h-8 w-12 object-contain rounded" />
                    ) : (
                      <div className="h-8 w-12 flex items-center justify-center bg-slate-100 rounded">
                        <Image size={16} className="text-slate-400" />
                      </div>
                    )}
                    <span className="text-xs font-semibold text-slate-600">
                      {addUploading ? 'Uploading…' : addPreview ? 'Change image' : 'Select image'}
                    </span>
                    {addUploading && <Loader2 size={14} className="animate-spin text-indigo-500 ml-auto" />}
                  </div>
                  <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={handleAddFile} />
                </div>
              </div>
              {addError && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {addError}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddName(''); setAddPreview(''); setAddError(''); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAddLogo}
                  disabled={!addName.trim() || !addPreview || addUploading}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={13} /> Add to List
                </button>
              </div>
            </div>
          )}

          {/* Logo list */}
          {logos.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Users2 size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No partner logos. Click &ldquo;Add Logo&rdquo; to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logos.map((logo, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  {/* Thumbnail */}
                  <div
                    className="h-12 w-20 shrink-0 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center p-1.5 cursor-pointer hover:border-indigo-300 transition-colors group relative overflow-hidden"
                    onClick={() => replaceRefs.current.get(i)?.click()}
                    title="Click to replace image"
                  >
                    <img src={logo.src} alt={logo.name} className="max-h-full max-w-full object-contain" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload size={12} className="text-white" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={el => { if (el) replaceRefs.current.set(i, el); else replaceRefs.current.delete(i); }}
                      onChange={e => handleReplaceFile(i, e)}
                    />
                  </div>

                  {/* Name (editable) */}
                  <input
                    type="text"
                    value={logo.name}
                    onChange={e => setLogos(prev => prev.map((l, idx) => idx === i ? { ...l, name: e.target.value } : l))}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none py-1 transition-colors"
                  />

                  {/* Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveLogo(i, -1)}
                      disabled={i === 0}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
                      title="Move up"
                    >
                      <MoveUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLogo(i, 1)}
                      disabled={i === logos.length - 1}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
                      title="Move down"
                    >
                      <MoveDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLogo(i)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Status */}
          {logosStatus === 'error' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} /> {logosError || 'Save failed'}
            </div>
          )}
          {logosStatus === 'saved' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={13} /> Partner logos saved.
            </div>
          )}

          {/* Save logos button */}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={saveLogos}
              disabled={logosSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 shadow-sm transition-all"
            >
              {logosSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {logosSaving ? 'Saving…' : 'Save Partner Logos'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Campaign Gallery ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm border border-slate-100">
              <GalleryHorizontal size={18} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Campaign Gallery</h4>
              <p className="text-xs text-slate-500">Masonry photo gallery shown in the &ldquo;Previous Campaigns&rdquo; section. Upload multiple images.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> Add Photos
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGalleryFiles}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleGalleryDrop}
            onClick={() => galleryInputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors flex flex-col items-center justify-center gap-3 py-8 text-slate-400"
          >
            {galleryUploading ? (
              <>
                <Loader2 size={28} className="animate-spin text-indigo-400" />
                <p className="text-sm font-semibold text-indigo-600">Uploading…</p>
              </>
            ) : (
              <>
                <div className="p-4 bg-slate-100 rounded-full"><Upload size={24} /></div>
                <p className="text-sm font-semibold">Drop photos here or click to upload</p>
                <p className="text-xs">PNG, JPG, WebP — max 5 MB each — multiple allowed</p>
              </>
            )}
          </div>

          {/* Masonry preview grid */}
          {gallery.length > 0 && (
            <div className="columns-2 gap-3 sm:columns-3 md:columns-4">
              {gallery.map((img, i) => (
                <div key={i} className="mb-3 break-inside-avoid group relative overflow-hidden rounded-lg">
                  <img src={img.src} alt={`Gallery ${i + 1}`} className="w-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeGalleryImage(i)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {gallery.length === 0 && !galleryUploading && (
            <p className="text-center text-xs text-slate-400 py-2">No gallery images yet. Upload photos to populate the campaign gallery section.</p>
          )}

          {/* Status */}
          {galleryStatus === 'error' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} /> {galleryError || 'Save failed'}
            </div>
          )}
          {galleryStatus === 'saved' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle size={13} /> Campaign gallery saved.
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={saveGallery}
              disabled={gallerySaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 shadow-sm transition-all"
            >
              {gallerySaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {gallerySaving ? 'Saving…' : 'Save Gallery'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
