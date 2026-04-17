/**
 * Auth Callback — handles password reset links
 * URL format: /auth/callback?token=<reset_token>&type=reset
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useToast } from './ToastProvider';
import { Loader2, CheckCircle, XCircle, Lock, Check, X } from 'lucide-react';
import { api } from '../services/apiClient';

type Status = 'loading' | 'reset-form' | 'success' | 'error';

function validatePassword(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export const AuthCallback: React.FC = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Processing...');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const pwChecks = useMemo(() => validatePassword(newPassword), [newPassword]);
  const allPassed = Object.values(pwChecks).every(Boolean);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('token');
    const type = params.get('type');

    if (type === 'reset' && resetToken) {
      setToken(resetToken);
      setStatus('reset-form');
      setMessage('Create your new password');
    } else {
      setStatus('error');
      setMessage('Invalid or expired link');
    }
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPassed) { showToast('Password does not meet all requirements', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }

    setIsUpdating(true);
    try {
      await api.post('/api/auth/update-password', { token, newPassword });
      showToast('Password updated successfully!', 'success');
      setStatus('success');
      setMessage('Password updated! You can now log in with your new password.');
      setTimeout(() => window.location.href = '/', 2000);
    } catch (error: any) {
      showToast(error.message || 'Failed to update password', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="bg-[#12121a] rounded-3xl border border-white/[0.06] shadow-2xl shadow-black/50 p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <><Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Processing</h2>
          <p className="text-slate-400">{message}</p></>
        )}

        {status === 'reset-form' && (
          <>
            <Lock className="w-16 h-16 text-indigo-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Reset Password</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <form onSubmit={handleUpdatePassword} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white outline-none text-sm"
                  placeholder="••••••••" minLength={8} required />
                {newPassword && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {([
                      ['minLength', 'At least 8 characters'],
                      ['uppercase', 'One uppercase letter'],
                      ['lowercase', 'One lowercase letter'],
                      ['number', 'One number'],
                      ['special', 'One special character (!@#$%^&*)'],
                    ] as const).map(([key, label]) => (
                      <li key={key} className={`flex items-center gap-1.5 ${pwChecks[key] ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {pwChecks[key] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white outline-none text-sm"
                  placeholder="••••••••" minLength={8} required />
              </div>
              <button type="submit" disabled={isUpdating}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isUpdating ? <><Loader2 className="w-5 h-5 animate-spin" />Updating...</> : 'Update Password'}
              </button>
            </form>
          </>
        )}

        {status === 'success' && (
          <><CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Password Updated!</h2>
          <p className="text-slate-400">{message}</p></>
        )}

        {status === 'error' && (
          <><XCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Something Went Wrong</h2>
          <p className="text-slate-400 mb-6">{message}</p>
          <button onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all">
            Back to Login
          </button></>
        )}
      </div>
    </div>
  );
};
