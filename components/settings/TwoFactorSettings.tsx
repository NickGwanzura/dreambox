import React, { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Copy, Check, Loader2, Smartphone, AlertTriangle, ChevronRight } from 'lucide-react';
import { api } from '../../services/apiClient';

interface MeResponse {
  user?: { twoFactorEnabled?: boolean; email?: string };
}

/**
 * Two-factor authentication (TOTP) settings card — Admin/Manager accounts.
 * Setup → shows base32 secret + otpauth URL; enable requires a valid code;
 * disable requires the current code so a stolen session can't turn it off.
 */
export const TwoFactorSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Setup flow state
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpAuthUrl] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<MeResponse>('/api/auth/me')
      .then(r => setEnabled(!!r.user?.twoFactorEnabled))
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);

  const startSetup = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api.post<{ secret: string; otpauthUrl: string }>('/api/auth/two-factor/setup', {});
      setSecret(res.secret);
      setOtpAuthUrl(res.otpauthUrl);
      setCode('');
    } catch (e: any) {
      setError(e.message || 'Could not start setup');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.post('/api/auth/two-factor/enable', { code: code.trim() });
      setEnabled(true);
      setSecret('');
      setOtpAuthUrl('');
      setCode('');
      setNotice('Two-factor authentication is now active for your account.');
    } catch (e: any) {
      setError(e.message || 'Could not enable two-factor authentication');
    } finally {
      setBusy(false);
    }
  };

  const cancelSetup = () => {
    setSecret('');
    setOtpAuthUrl('');
    setCode('');
    setError('');
  };

  const confirmDisable = async () => {
    setError('');
    setNotice('');
    if (!window.confirm('Disable two-factor authentication? You will lose the extra security on this account.')) return;
    const current = window.prompt('Enter the current 6-digit code from your authenticator app to confirm:');
    if (!current) return;
    setBusy(true);
    try {
      await api.post('/api/auth/two-factor/disable', { code: current.trim() });
      setEnabled(false);
      setNotice('Two-factor authentication has been disabled.');
    } catch (e: any) {
      setError(e.message || 'Could not disable two-factor authentication');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${enabled ? 'bg-emerald-50' : 'bg-indigo-50'}`}>
            <ShieldCheck className={`w-6 h-6 ${enabled ? 'text-emerald-600' : 'text-indigo-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-800">Two-Factor Authentication</h3>
            <p className="text-xs text-slate-700">
              {loading ? 'Checking status…' : enabled
                ? 'Your account is protected by a time-based one-time passcode.'
                : 'Add a second layer of security with your authenticator app.'}
            </p>
          </div>
          {!loading && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking account status…
          </div>
        )}

        {!loading && error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {!loading && notice && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
          </div>
        )}

        {!loading && !enabled && !secret && (
          <button
            onClick={startSetup}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Set Up Two-Factor Authentication
          </button>
        )}

        {!loading && enabled && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Protection active</p>
                <p className="text-xs text-slate-700">A code is required on every sign-in.</p>
              </div>
            </div>
            <button
              onClick={confirmDisable}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50"
            >
              Disable
            </button>
          </div>
        )}

        {!loading && secret && (
          <div className="space-y-4 animate-fade-in">
                <ol className="space-y-2 text-sm text-slate-800">
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>Open your authenticator app (Google Authenticator, Authy, 1Password…).</li>
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>Add a new account and scan the setup key below (or enter the otpauth URL).</li>
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>Enter the 6-digit code to confirm and activate.</li>
            </ol>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Setup Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-900 text-emerald-300 font-mono text-sm tracking-widest rounded-xl px-4 py-3 select-all break-all">{secret}</code>
                <button
                  onClick={copySecret}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  title="Copy secret"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <details className="mt-2">
                <summary className="text-xs text-slate-700 hover:text-slate-900 cursor-pointer">Show otpauth:// URL (manual entry)</summary>
                <code className="block mt-2 text-[11px] text-slate-700 font-mono break-all bg-slate-50 rounded-lg p-3 border border-slate-100">{otpauthUrl}</code>
              </details>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 rounded-xl px-4 py-3 text-slate-800 font-mono tracking-[0.4em] text-center outline-none transition-all placeholder:tracking-normal"
              />
              <button
                onClick={confirmEnable}
                disabled={busy || code.trim().length !== 6}
                className="px-5 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Activate
              </button>
            </div>

              <button onClick={cancelSetup} className="text-xs text-slate-700 hover:text-slate-900 transition-colors">
              Cancel setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
