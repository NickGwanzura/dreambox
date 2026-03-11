/**
 * Auth Callback Handler
 * Handles email verification and password reset callbacks from Supabase
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useToast } from './ToastProvider';
import { Loader2, CheckCircle, XCircle, Lock, Mail } from 'lucide-react';

type CallbackType = 'verify' | 'reset' | null;
type Status = 'loading' | 'success' | 'error';

export const AuthCallback: React.FC = () => {
  const { showToast } = useToast();
  
  const [type, setType] = useState<CallbackType>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Processing...');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      if (!supabase) {
        setStatus('error');
        setMessage('Supabase not configured');
        return;
      }

      // Get URL params
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      // Check for error in URL
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');
      
      if (error) {
        setStatus('error');
        setMessage(errorDescription || 'Authentication failed');
        return;
      }

      // Determine callback type from URL path
      const path = window.location.pathname;
      if (path.includes('reset-password')) {
        setType('reset');
        handlePasswordReset();
      } else if (path.includes('verify') || urlParams.has('token') || hashParams.has('access_token')) {
        setType('verify');
        handleEmailVerification();
      } else {
        // Generic auth callback - exchange code for session
        handleAuthCode();
      }
    };

    handleCallback();
  }, []);

  const handleEmailVerification = async () => {
    try {
      // Supabase handles the verification token automatically
      // We just need to check if the session is valid
      const { data: { session }, error } = await supabase!.auth.getSession();
      
      if (error) throw error;
      
      if (session?.user?.email_confirmed_at) {
        setStatus('success');
        setMessage('Email verified successfully! You can now log in.');
        showToast('Email verified!', 'success');
        
        // Redirect to login after 3 seconds
        setTimeout(() => window.location.href = '/', 3000);
      } else {
        // Check for hash params (Supabase sends token in URL hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        
        if (accessToken) {
          // Exchange the token for a session
          const { error: exchangeError } = await supabase!.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token') || '',
          });
          
          if (exchangeError) throw exchangeError;
          
          setStatus('success');
          setMessage('Email verified successfully! You can now log in.');
          showToast('Email verified!', 'success');
          
          setTimeout(() => window.location.href = '/', 3000);
        } else {
          throw new Error('Invalid or expired verification link');
        }
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Email verification failed');
      showToast('Verification failed', 'error');
    }
  };

  const handlePasswordReset = async () => {
    try {
      // Check for access token in URL hash (Supabase sends it there)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (accessToken && type === 'recovery') {
        // Set the session from the recovery token
        const { error } = await supabase!.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || '',
        });
        
        if (error) throw error;
        
        // Show password reset form
        setStatus('success');
        setMessage('Create your new password');
      } else {
        // Check if we already have a valid recovery session
        const { data: { session } } = await supabase!.auth.getSession();
        if (session) {
          setStatus('success');
          setMessage('Create your new password');
        } else {
          throw new Error('Invalid or expired reset link');
        }
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Password reset failed');
      showToast('Reset failed', 'error');
    }
  };

  const handleAuthCode = async () => {
    try {
      // Handle OAuth or magic link callbacks
      const { data, error } = await supabase!.auth.getSession();
      
      if (error) throw error;
      
      if (data.session) {
        setStatus('success');
        setMessage('Authentication successful!');
        showToast('Welcome back!', 'success');
        
        setTimeout(() => window.location.href = '/', 1500);
      } else {
        throw new Error('No session found');
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Authentication failed');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    
    setIsUpdating(true);
    
    try {
      const { error } = await supabase!.auth.updateUser({
        password: newPassword,
      });
      
      if (error) throw error;
      
      showToast('Password updated successfully!', 'success');
      setMessage('Password updated! You can now log in with your new password.');
      
      // Sign out and redirect to login
      await supabase!.auth.signOut();
      
      setTimeout(() => window.location.href = '/login', 2000);
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
          <>
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Processing</h2>
            <p className="text-slate-400">{message}</p>
          </>
        )}
        
        {status === 'success' && type === 'verify' && (
          <>
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Email Verified!</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <p className="text-xs text-slate-500">Redirecting to login...</p>
          </>
        )}
        
        {status === 'success' && type === 'reset' && (
          <>
            <Lock className="w-16 h-16 text-indigo-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Reset Password</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            
            <form onSubmit={handleUpdatePassword} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={isUpdating}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Something Went Wrong</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};
