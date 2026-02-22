
import React, { useState, useEffect } from 'react';
import { login, register, resetPassword } from '../services/authService';
import { RELEASE_NOTES } from '../services/mockData';
import { User, Lock, Mail, ArrowRight, Loader2, CheckCircle, ArrowLeft, Sparkles, ShieldCheck, Trash2 } from 'lucide-react';

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
    
    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            // Simulate network delay for premium feel
            await new Promise(resolve => setTimeout(resolve, 800));

            if (mode === 'login') {
                const user = await login(email, password);
                if (user) {
                    onLogin();
                } else {
                    setError('Invalid credentials');
                }
            } else if (mode === 'register') {
                if(!firstName || !lastName) {
                    setError("Please fill in all fields");
                    setIsLoading(false);
                    return;
                }
                await register(firstName, lastName, email, password);
                setSuccessMessage("Account created successfully! Your account is pending Administrator approval. You will be able to login once approved.");
                setMode('login'); // Switch to login screen to show message there
                setPassword('');
            } else if (mode === 'forgot') {
                await resetPassword(email);
                setSuccessMessage('Recovery instructions sent to your email.');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
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
        if (window.confirm("⚠️ EMERGENCY RESET\n\nThis will wipe all local data to fix 'Storage Full' errors.\nAre you sure?")) {
            localStorage.clear();
            window.location.reload();
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#020617] font-sans text-slate-200 overflow-hidden">
            {/* Left Side - Brand & Updates (Hidden on Mobile) */}
            <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden flex-col justify-between p-16">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2929&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay grayscale"></div>
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-600/30 rounded-full blur-[150px] animate-blob"></div>
                    <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-violet-600/30 rounded-full blur-[150px] animate-blob animation-delay-2000"></div>
                </div>

                <div className="relative z-10">
                    <div className="inline-flex items-center gap-3 mb-8">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-white/10">
                            <span className="text-white font-black text-xl">D</span>
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-white">Dreambox</span>
                    </div>
                    <h1 className="text-5xl font-extrabold tracking-tight leading-tight mb-6">
                        Orchestrate your <br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">advertising fleet.</span>
                    </h1>
                    <p className="text-lg text-slate-400 max-w-md leading-relaxed">
                        The complete operating system for modern billboard management. Track inventory, automate billing, and scale your revenue.
                    </p>
                </div>

                <div className="relative z-10 bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 max-w-md">
                    <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest text-indigo-400">
                        <Sparkles size={14} /> What's New in v{RELEASE_NOTES[0].version}
                    </div>
                    <h3 className="text-white font-bold mb-2">{RELEASE_NOTES[0].title}</h3>
                    <ul className="space-y-2 mb-4">
                        {RELEASE_NOTES[0].features.slice(0, 2).map((feat, i) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                                <div className="mt-1.5 w-1 h-1 bg-indigo-500 rounded-full shrink-0"></div>
                                {feat}
                            </li>
                        ))}
                    </ul>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="bg-slate-800 px-2 py-1 rounded border border-slate-700">{RELEASE_NOTES[0].date}</span>
                        <span>Latest Stable Build</span>
                    </div>
                </div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 lg:p-12 relative">
                {/* Mobile Background Elements */}
                <div className="absolute inset-0 overflow-hidden lg:hidden z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/20 rounded-full blur-[100px]"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-violet-600/20 rounded-full blur-[100px]"></div>
                </div>

                <div className={`w-full max-w-md transition-all duration-700 relative z-10 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                    
                    {/* Mobile Brand Header */}
                    <div className="lg:hidden text-center mb-10">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/20 mb-4">
                            <span className="text-white font-black text-2xl">D</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white">Dreambox</h2>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-white mb-2">
                            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Request Access' : 'Reset Password'}
                        </h2>
                        <p className="text-slate-400">
                            {mode === 'login' ? 'Enter your credentials to access your dashboard.' : 
                             mode === 'register' ? 'Create an account. Admin approval required.' : 
                             'We will send you a secure link to reset your password.'}
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-sm p-4 rounded-xl mb-6 flex items-start gap-3 animate-fade-in">
                            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                            <div>{error}</div>
                        </div>
                    )}
                    
                    {successMessage && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm p-4 rounded-xl mb-6 flex items-center gap-3 animate-fade-in">
                            <CheckCircle size={18} />
                            <div>{successMessage}</div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {mode === 'register' && (
                            <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">First Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-900/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all"
                                        placeholder="John"
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Last Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-900/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none transition-all"
                                        placeholder="Doe"
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                                {mode === 'login' ? 'Email or Username' : 'Email Address'}
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-900/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-600 outline-none transition-all"
                                    placeholder={mode === 'login' ? "admin or name@company.com" : "name@company.com"}
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {(mode === 'login' || mode === 'register') && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Password</label>
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
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
                                    <input 
                                        type="password" 
                                        className="w-full bg-slate-900/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-600 outline-none transition-all"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={isLoading || (mode === 'forgot' && !!successMessage)}
                            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-3.5 rounded-xl font-bold uppercase tracking-wider text-sm shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2 mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} /> : (
                                mode === 'login' ? 'Sign In' : 
                                mode === 'register' ? 'Register Account' : 
                                successMessage ? 'Email Sent' : 'Send Reset Link'
                            )}
                            {!isLoading && !successMessage && <ArrowRight size={18} />}
                        </button>
                    </form>

                    <div className="mt-8 flex items-center justify-center gap-4">
                        <div className="h-[1px] bg-slate-800 flex-1"></div>
                        <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Or</span>
                        <div className="h-[1px] bg-slate-800 flex-1"></div>
                    </div>

                    <div className="mt-8 text-center space-y-4">
                        {mode === 'forgot' ? (
                            <button 
                                onClick={() => toggleMode('login')}
                                className="text-slate-400 hover:text-white text-sm font-medium flex items-center justify-center gap-2 mx-auto transition-colors"
                            >
                                <ArrowLeft size={16} /> Back to Login
                            </button>
                        ) : (
                            <div className="text-center">
                                <p className="text-slate-400 text-sm mb-3">
                                    {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                                </p>
                                <button 
                                    onClick={() => toggleMode(mode === 'login' ? 'register' : 'login')}
                                    className="w-full py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white rounded-xl font-bold text-sm transition-all"
                                >
                                    {mode === 'login' ? 'Create New Account' : 'Sign In to Existing Account'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="absolute bottom-6 left-0 w-full text-center flex flex-col gap-2">
                    <p className="text-slate-600 text-xs">
                        &copy; 2026 Dreambox Advertising. <span className="mx-2">•</span> Privacy <span className="mx-2">•</span> Terms
                    </p>
                    <button onClick={handleEmergencyReset} className="text-[10px] text-slate-700 hover:text-red-500 flex items-center justify-center gap-1 uppercase tracking-widest font-bold transition-colors">
                        <Trash2 size={10} /> Reset Data
                    </button>
                </div>
            </div>
        </div>
    );
};
