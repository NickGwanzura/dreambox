
import React, { useState, useEffect, useCallback } from 'react';
import { login, register, resetPassword, devLogin } from '../services/authServiceSecure';
import { useToast } from './ToastProvider';
import { RELEASE_NOTES } from '../services/mockData';
import { 
  User, Lock, Mail, ArrowRight, CheckCircle, ArrowLeft, 
  Sparkles, ShieldCheck, Trash2, Eye, EyeOff, Building2,
  TrendingUp, Users, DollarSign, BarChart3
} from 'lucide-react';
import { LoadingButton } from './ui/LoadingButton';
import { validators, ValidationError, sanitizers } from '../utils/validation';
import { logger } from '../utils/logger';

interface AuthProps {
    onLogin: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<AuthMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [mounted, setMounted] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    const { showToast } = useToast();

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    const validateForm = useCallback((): boolean => {
        try {
            if (mode === 'login') {
                validators.required(email, 'Email/Username');
                validators.required(password, 'Password');
            } else if (mode === 'register') {
                validators.required(firstName, 'First name');
                validators.required(lastName, 'Last name');
                validators.required(email, 'Email');
                validators.email(email);
                validators.required(password, 'Password');
                if (password.length < 6) {
                    throw new ValidationError('Password must be at least 6 characters');
                }
            } else if (mode === 'forgot') {
                validators.required(email, 'Email');
                validators.email(email);
            }
            return true;
        } catch (err) {
            if (err instanceof ValidationError) {
                setError(err.message);
            }
            return false;
        }
    }, [mode, email, password, firstName, lastName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        
        if (!validateForm()) {
            return;
        }
        
        setIsLoading(true);

        try {
            const sanitizedEmail = sanitizers.email(email);
            const sanitizedFirstName = sanitizers.string(firstName);
            const sanitizedLastName = sanitizers.string(lastName);

            if (mode === 'login') {
                const user = await login(sanitizedEmail, password);
                if (user) {
                    showToast('Welcome back!', 'success');
                    onLogin();
                } else {
                    setError('Invalid email or password');
                    showToast('Invalid credentials', 'error');
                }
            } else if (mode === 'register') {
                await register(sanitizedFirstName, sanitizedLastName, sanitizedEmail, password);
                setSuccessMessage("Account created! Your account is pending administrator approval.");
                showToast('Account created — pending approval', 'success');
                setMode('login');
                setPassword('');
                setFirstName('');
                setLastName('');
            } else if (mode === 'forgot') {
                await resetPassword(sanitizedEmail);
                setSuccessMessage('Check your email for reset instructions.');
                showToast('Reset email sent', 'info');
            }
        } catch (err: any) {
            const message = err instanceof ValidationError 
                ? err.message 
                : err.message || 'An error occurred';
            setError(message);
            showToast(message, 'error');
            logger.error('Auth error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleMode = (newMode: AuthMode) => {
        setMode(newMode);
        setError('');
        setSuccessMessage('');
        setPassword('');
    };

    const handleEmergencyReset = () => {
        if (window.confirm("⚠️ Emergency Reset\n\nThis will clear all local data.\nAre you sure?")) {
            localStorage.clear();
            window.location.reload();
        }
    };

    // Feature highlights for the left side
    const features = [
        { icon: TrendingUp, label: 'Track Revenue', desc: 'Real-time analytics' },
        { icon: Users, label: 'Manage Clients', desc: 'Centralized database' },
        { icon: DollarSign, label: 'Automate Billing', desc: 'Never miss a payment' },
        { icon: BarChart3, label: 'Grow Business', desc: 'Data-driven insights' },
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#0a0a0f] font-sans text-slate-200 overflow-hidden">
            {/* Left Side - Modern Brand Experience */}
            <div className="hidden lg:flex w-[55%] relative overflow-hidden flex-col justify-between">
                {/* Animated Gradient Background */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-[#0a0a0f] to-violet-950"></div>
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-600/20 via-transparent to-transparent"></div>
                    <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent"></div>
                    
                    {/* Animated Orbs */}
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[128px] animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }}></div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full p-12 xl:p-16">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-auto">
                        <div className="relative">
                            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/10">
                                <Building2 className="w-6 h-6 text-white" />
                            </div>
                            <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl blur opacity-30"></div>
                        </div>
                        <div>
                            <span className="text-xl font-bold tracking-tight text-white">Dreambox</span>
                            <span className="block text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold -mt-0.5">Advertising Platform</span>
                        </div>
                    </div>

                    {/* Hero Content */}
                    <div className="my-auto py-12">
                        <h1 className="text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                            <span className="text-white">Manage your</span>
                            <br />
                            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                                billboard empire
                            </span>
                        </h1>
                        <p className="text-lg text-slate-400 max-w-md leading-relaxed mb-10">
                            The all-in-one platform for modern outdoor advertising. Track inventory, automate billing, and scale your revenue.
                        </p>

                        {/* Feature Grid */}
                        <div className="grid grid-cols-2 gap-4 max-w-md">
                            {features.map((feat, i) => (
                                <div 
                                    key={i} 
                                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-default"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center border border-indigo-500/20">
                                        <feat.icon className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">{feat.label}</p>
                                        <p className="text-xs text-slate-500">{feat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Version Badge */}
                    <div className="flex items-center gap-3 mt-auto">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-xs font-medium text-slate-400">v{RELEASE_NOTES[0].version}</span>
                        </div>
                        <span className="text-xs text-slate-600">{RELEASE_NOTES[0].title}</span>
                    </div>
                </div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 relative overflow-hidden">
                {/* Mobile Gradient */}
                <div className="absolute inset-0 lg:hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/50 via-[#0a0a0f] to-violet-950/50"></div>
                </div>

                <div 
                    className={`w-full max-w-[420px] transition-all duration-700 relative z-10 ${
                        mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                    }`}
                >
                    {/* Mobile Logo */}
                    <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-white">Dreambox</span>
                    </div>

                    {/* Card */}
                    <div className="bg-[#12121a] rounded-3xl border border-white/[0.06] shadow-2xl shadow-black/50 overflow-hidden">
                        {/* Card Header */}
                        <div className="px-8 pt-8 pb-6 border-b border-white/[0.06]">
                            <h2 className="text-2xl font-bold text-white mb-1">
                                {mode === 'login' ? 'Welcome back' : 
                                 mode === 'register' ? 'Create account' : 
                                 'Reset password'}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {mode === 'login' ? 'Sign in to access your dashboard' : 
                                 mode === 'register' ? 'Get started with your free account' : 
                                 'Enter your email to receive reset instructions'}
                            </p>
                        </div>

                        {/* Card Body */}
                        <div className="p-8">
                            {/* Error Alert */}
                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-fade-in">
                                    <ShieldCheck className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-200">{error}</p>
                                </div>
                            )}
                            
                            {/* Success Alert */}
                            {successMessage && (
                                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 animate-fade-in">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                    <p className="text-sm text-emerald-200">{successMessage}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Name Fields */}
                                {mode === 'register' && (
                                    <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                First Name
                                            </label>
                                            <input 
                                                type="text" 
                                                value={firstName}
                                                onChange={e => setFirstName(e.target.value)}
                                                className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                                                placeholder="John"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                Last Name
                                            </label>
                                            <input 
                                                type="text" 
                                                value={lastName}
                                                onChange={e => setLastName(e.target.value)}
                                                className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                                                placeholder="Doe"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Email Field */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                        {mode === 'login' ? 'Email or Username' : 'Email Address'}
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                                        <input 
                                            type="text" 
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                                            placeholder={mode === 'login' ? "you@company.com" : "you@company.com"}
                                        />
                                    </div>
                                </div>

                                {/* Password Field */}
                                {(mode === 'login' || mode === 'register') && (
                                    <div className="space-y-2 animate-fade-in">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                Password
                                            </label>
                                            {mode === 'login' && (
                                                <button 
                                                    type="button"
                                                    onClick={() => toggleMode('forgot')}
                                                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                                >
                                                    Forgot password?
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                                            <input 
                                                type={showPassword ? "text" : "password"}
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                className="w-full bg-[#0a0a0f] border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-12 pr-12 py-3 text-white placeholder-slate-600 outline-none transition-all text-sm"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400 transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        {mode === 'register' && (
                                            <p className="text-xs text-slate-500">Must be at least 6 characters</p>
                                        )}
                                    </div>
                                )}

                                {/* Submit Button */}
                                <LoadingButton 
                                    type="submit"
                                    loading={isLoading}
                                    disabled={mode === 'forgot' && !!successMessage}
                                    variant="primary"
                                    size="lg"
                                    className="w-full mt-2 !rounded-xl"
                                    spinnerPosition="left"
                                >
                                    {mode === 'login' ? 'Sign In' : 
                                     mode === 'register' ? 'Create Account' : 
                                     successMessage ? 'Email Sent' : 'Send Reset Link'}
                                </LoadingButton>
                            </form>



                            {/* Divider */}
                            <div className="mt-6 flex items-center gap-4">
                                <div className="flex-1 h-px bg-white/10"></div>
                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    {mode === 'login' ? "New to Dreambox?" : "Already have an account?"}
                                </span>
                                <div className="flex-1 h-px bg-white/10"></div>
                            </div>

                            {/* Toggle Mode */}
                            <div className="mt-6">
                                {mode === 'forgot' ? (
                                    <button 
                                        onClick={() => toggleMode('login')}
                                        className="w-full flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Back to sign in
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => toggleMode(mode === 'login' ? 'register' : 'login')}
                                        className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        {mode === 'login' ? (
                                            <>
                                                Create an account
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        ) : (
                                            <>
                                                <ArrowLeft className="w-4 h-4" />
                                                Sign in to existing account
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center space-y-4">
                        <p className="text-xs text-slate-600">
                            &copy; 2026 Dreambox Advertising. 
                            <span className="mx-2">•</span>
                            <a href="#" className="hover:text-slate-400 transition-colors">Privacy</a>
                            <span className="mx-2">•</span>
                            <a href="#" className="hover:text-slate-400 transition-colors">Terms</a>
                        </p>
                        <button 
                            onClick={handleEmergencyReset} 
                            className="text-[10px] text-slate-700 hover:text-red-500 flex items-center justify-center gap-1.5 uppercase tracking-widest font-semibold transition-colors mx-auto"
                        >
                            <Trash2 className="w-3 h-3" />
                            Reset Local Data
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
