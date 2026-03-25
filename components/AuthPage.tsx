import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { authService } from '../services/authService';

interface AuthPageProps {
    onLogin: (user: any) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                const data = await authService.login(email, password);
                onLogin(data.user);
            } else {
                if (!name.trim()) {
                    throw new Error('Name is required for signup');
                }
                const data = await authService.signup(name, email, password);
                onLogin(data.user);
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #000000 100%)',
            fontFamily: "'Roboto', sans-serif",
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Decorative background elements */}
            <div style={{
                position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw',
                background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute', bottom: '-20%', right: '-10%', width: '50vw', height: '50vw',
                background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)',
                borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none'
            }} />

            <div style={{
                width: '100%',
                maxWidth: 420,
                padding: '40px',
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 24,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
            }}>
                {/* Logo */}
                <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 24, boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)'
                }}>
                    <span className="material-symbols-rounded" style={{ color: '#fff', fontSize: 36 }}>
                        robot_2
                    </span>
                </div>

                <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
                    Welcome to Meet AI
                </h1>
                <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 32px', textAlign: 'center' }}>
                    {isLogin ? 'Sign in to access your AI interview assistant' : 'Create an account to get started'}
                </p>

                {error && (
                    <div style={{
                        width: '100%', padding: 12, borderRadius: 8,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#ef4444', fontSize: 13, marginBottom: 20,
                        display: 'flex', alignItems: 'center', gap: 8
                    }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>error</span>
                        {error}
                    </div>
                )}

                <div style={{ width: '100%', marginBottom: 16 }}>
                    <GoogleLogin
                        onSuccess={async (credentialResponse) => {
                            try {
                                setIsLoading(true);
                                setError('');
                                if (!credentialResponse.credential) throw new Error('No credential received');
                                const data = await authService.googleLogin(credentialResponse.credential);
                                onLogin(data.user);
                            } catch (err: any) {
                                setError(err.message || 'Google Sign-In failed');
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                        onError={() => {
                            setError('Google Sign-In was unsuccessful or canceled');
                        }}
                        theme="filled_black"
                        size="large"
                        width="340"
                        shape="pill"
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 16 }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
                    <span style={{ margin: '0 12px', color: '#64748b', fontSize: 12, fontWeight: 500 }}>OR</span>
                    <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
                </div>

                <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {!isLogin && (
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="John Doe"
                                disabled={isLoading}
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: 12,
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#fff', fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            disabled={isLoading}
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: 12,
                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff', fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            disabled={isLoading}
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: 12,
                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff', fontSize: 15, outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 12,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            border: 'none', color: '#fff', fontSize: 15, fontWeight: 600,
                            cursor: isLoading ? 'wait' : 'pointer', marginTop: 8,
                            transition: 'transform 0.1s, opacity 0.2s',
                            opacity: isLoading ? 0.7 : 1,
                            boxShadow: '0 4px 14px 0 rgba(99, 102, 241, 0.39)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                    >
                        {isLoading ? (
                            <span className="material-symbols-rounded" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
                        ) : (
                            isLogin ? 'Sign In' : 'Create Account'
                        )}
                    </button>
                </form>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        style={{
                            background: 'none', border: 'none', color: '#cbd5e1',
                            fontSize: 14, cursor: 'pointer', padding: 8
                        }}
                    >
                        {isLogin ? (
                            <span>Don't have an account? <span style={{ color: '#8b5cf6', fontWeight: 500 }}>Sign up</span></span>
                        ) : (
                            <span>Already have an account? <span style={{ color: '#8b5cf6', fontWeight: 500 }}>Sign in</span></span>
                        )}
                    </button>
                </div>
            </div>
            <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        input:focus { border-color: #8b5cf6 !important; }
      `}</style>
        </div>
    );
};
