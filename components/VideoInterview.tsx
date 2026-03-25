import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    connectToLiveSession,
    LiveSessionConfig,
} from '../services/geminiService';
import { decodeAudioData, downsampleBuffer } from '../utils/audioUtils';
import { Persona } from '../types';
import { AudioVisualizer } from './AudioVisualizer';

interface VideoInterviewProps {
    persona: Persona;
    onEnd: () => void;
}

export const VideoInterview: React.FC<VideoInterviewProps> = ({ persona, onEnd }) => {
    // UI State
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [userTranscript, setUserTranscript] = useState('');
    const [elapsedTime, setElapsedTime] = useState(0);
    const [initError, setInitError] = useState<string | null>(null);

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const liveSessionRef = useRef<any>(null);
    const nextStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const currentTurnTextRef = useRef<string>('');
    const userSpeechBufferRef = useRef<string>('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const aiSpeakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const stopAudioPlayback = useCallback(() => {
        audioSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) { } });
        audioSourcesRef.current = [];
    }, []);

    // Initialize camera + audio session
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            // Step 1: Try to get camera (non-fatal if it fails)
            try {
                const camStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false,
                });
                if (cancelled) { camStream.getTracks().forEach(t => t.stop()); return; }
                cameraStreamRef.current = camStream;
                if (videoRef.current) {
                    videoRef.current.srcObject = camStream;
                }
            } catch (camErr: any) {
                console.warn('Camera not available:', camErr.message);
                setIsCameraOff(true); // Show avatar instead — not fatal
            }

            // Step 2: Try to get audio + live session
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
                if (cancelled) { audioStream.getTracks().forEach(t => t.stop()); return; }
                mediaStreamRef.current = audioStream;

                // Setup audio context
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContextClass({ sampleRate: 24000 });
                audioContextRef.current = ctx;
                nextStartTimeRef.current = ctx.currentTime;

                // Connect live session
                const session = await connectToLiveSession({
                    persona,
                    onOpen: () => {
                        if (!cancelled) {
                            setIsConnected(true);
                            setIsConnecting(false);
                        }
                    },
                    onAudioData: (base64: string) => {
                        if (!audioContextRef.current) return;
                        setIsAiSpeaking(true);
                        if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
                        aiSpeakingTimeoutRef.current = setTimeout(() => setIsAiSpeaking(false), 1500);

                        try {
                            const buffer = decodeAudioData(base64, audioContextRef.current, 24000);
                            const source = audioContextRef.current.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioContextRef.current.destination);
                            const now = audioContextRef.current.currentTime;
                            const startTime = Math.max(now, nextStartTimeRef.current);
                            source.start(startTime);
                            nextStartTimeRef.current = startTime + buffer.duration;
                            source.onended = () => {
                                const idx = audioSourcesRef.current.indexOf(source);
                                if (idx > -1) audioSourcesRef.current.splice(idx, 1);
                            };
                            audioSourcesRef.current.push(source);
                        } catch (e) { console.error(e); }
                    },
                    onTranscript: (text: string, isUser: boolean, isFinal: boolean) => {
                        if (isUser) {
                            userSpeechBufferRef.current += text;
                            setUserTranscript(userSpeechBufferRef.current);
                        } else {
                            currentTurnTextRef.current += text;
                            setTranscript(currentTurnTextRef.current);
                            if (isFinal) {
                                currentTurnTextRef.current = '';
                            }
                        }
                    },
                    onInterrupted: () => {
                        stopAudioPlayback();
                        nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
                        currentTurnTextRef.current = '';
                        setIsAiSpeaking(false);
                    },
                    onClose: () => setIsConnected(false),
                    onError: (err: any) => {
                        console.error('Live session error:', err);
                        setInitError('AI session disconnected. You can retry by re-opening Video Interview.');
                        setIsConnecting(false);
                    }
                });

                if (cancelled) { session.disconnect(); return; }
                liveSessionRef.current = session;

                // Connect audio processor
                const source = ctx.createMediaStreamSource(audioStream);
                sourceRef.current = source;
                const processor = ctx.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;
                processor.onaudioprocess = (e) => {
                    if (!liveSessionRef.current) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    session.sendAudioChunk(downsampleBuffer(inputData, ctx.sampleRate, 16000));
                };
                source.connect(processor);
                processor.connect(ctx.destination);

            } catch (err: any) {
                console.error('Video interview audio/session error:', err);
                if (!cancelled) {
                    setInitError(err.message || 'Failed to connect. Please allow microphone access and try again.');
                    setIsConnecting(false);
                }
            }
        };

        init();

        // Timer
        timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);

        return () => {
            cancelled = true;
            if (timerRef.current) clearInterval(timerRef.current);
            if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
            liveSessionRef.current?.disconnect();
            processorRef.current?.disconnect();
            sourceRef.current?.disconnect();
            mediaStreamRef.current?.getTracks().forEach(t => t.stop());
            cameraStreamRef.current?.getTracks().forEach(t => t.stop());
            stopAudioPlayback();
            audioContextRef.current?.close();
        };
    }, [persona, onEnd, stopAudioPlayback]);

    const toggleMute = () => {
        if (mediaStreamRef.current) {
            const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleCamera = () => {
        if (cameraStreamRef.current) {
            const videoTrack = cameraStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOff(!videoTrack.enabled);
            }
        }
    };

    const handleEnd = () => {
        liveSessionRef.current?.disconnect();
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        cameraStreamRef.current?.getTracks().forEach(t => t.stop());
        stopAudioPlayback();
        audioContextRef.current?.close();
        onEnd();
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: '#000',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Roboto', sans-serif",
        }}>
            {/* Video Feed - Full Screen */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* User's camera */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)',
                        opacity: isCameraOff ? 0 : 1,
                        transition: 'opacity 0.3s ease',
                    }}
                />

                {/* Camera off placeholder */}
                {isCameraOff && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    }}>
                        <div style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 48,
                            color: '#fff',
                            fontWeight: 700,
                        }}>
                            U
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {initError && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 30,
                        background: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(20px)',
                        padding: '24px 32px',
                        borderRadius: 16,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        maxWidth: 360,
                        textAlign: 'center' as const,
                    }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#ef4444', marginBottom: 12, display: 'block' }}>
                            error_outline
                        </span>
                        <p style={{ color: '#fff', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                            {initError}
                        </p>
                        <button
                            onClick={handleEnd}
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#fff',
                                padding: '10px 24px',
                                borderRadius: 24,
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 600,
                            }}
                        >
                            Close & Retry
                        </button>
                    </div>
                )}

                {/* Top gradient overlay */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 120,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                    pointerEvents: 'none',
                }} />

                {/* Top bar: timer + status */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: isConnected ? '#4ade80' : '#fbbf24',
                            boxShadow: isConnected ? '0 0 10px rgba(74, 222, 128, 0.5)' : '0 0 10px rgba(251, 191, 36, 0.5)',
                            animation: isConnecting ? 'pulse 1.5s ease-in-out infinite' : 'none',
                        }} />
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                            {isConnecting ? 'Connecting...' : 'Meet AI Interview'}
                        </span>
                    </div>
                    <div style={{
                        background: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(10px)',
                        padding: '6px 14px',
                        borderRadius: 20,
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {formatTime(elapsedTime)}
                    </div>
                </div>

                {/* AI Avatar - Picture in Picture (Top Right) */}
                <div style={{
                    position: 'absolute',
                    top: 70,
                    right: 16,
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    border: `3px solid ${isAiSpeaking ? '#4ade80' : 'rgba(255,255,255,0.3)'}`,
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                    boxShadow: isAiSpeaking
                        ? '0 0 0 4px rgba(74, 222, 128, 0.2), 0 0 30px rgba(74, 222, 128, 0.15)'
                        : '0 4px 20px rgba(0,0,0,0.5)',
                    zIndex: 10,
                }}>
                    {/* Pulsing rings when AI speaks */}
                    {isAiSpeaking && (
                        <>
                            <div style={{
                                position: 'absolute',
                                inset: -8,
                                border: '2px solid rgba(74, 222, 128, 0.3)',
                                borderRadius: '50%',
                                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                            }} />
                            <div style={{
                                position: 'absolute',
                                inset: -16,
                                border: '2px solid rgba(74, 222, 128, 0.15)',
                                borderRadius: '50%',
                                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite 0.3s',
                            }} />
                        </>
                    )}
                    {/* AI face icon */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                    }}>
                        <span className="material-symbols-rounded" style={{
                            fontSize: 36,
                            color: isAiSpeaking ? '#4ade80' : '#94a3b8',
                            transition: 'color 0.3s ease',
                        }}>
                            smart_toy
                        </span>
                        {isAiSpeaking && (
                            <AudioVisualizer isActive={true} width={60} height={12} barColor="#4ade80" />
                        )}
                    </div>
                </div>

                {/* Bottom gradient overlay */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 200,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                    pointerEvents: 'none',
                }} />

                {/* Live Transcription */}
                <div style={{
                    position: 'absolute',
                    bottom: 100,
                    left: 16,
                    right: 16,
                    zIndex: 10,
                }}>
                    {/* AI transcript */}
                    {transcript && (
                        <div style={{
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(10px)',
                            padding: '10px 16px',
                            borderRadius: 12,
                            marginBottom: 8,
                            maxHeight: 80,
                            overflow: 'hidden',
                        }}>
                            <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                                AI
                            </span>
                            <p style={{
                                color: '#fff',
                                fontSize: 14,
                                lineHeight: 1.4,
                                margin: '4px 0 0',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical' as any,
                            }}>
                                {transcript}
                            </p>
                        </div>
                    )}

                    {/* User transcript */}
                    {userTranscript && (
                        <div style={{
                            background: 'rgba(59, 130, 246, 0.3)',
                            backdropFilter: 'blur(10px)',
                            padding: '8px 14px',
                            borderRadius: 12,
                            maxHeight: 60,
                            overflow: 'hidden',
                        }}>
                            <span style={{ color: '#93c5fd', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                                You
                            </span>
                            <p style={{
                                color: '#dbeafe',
                                fontSize: 13,
                                lineHeight: 1.3,
                                margin: '2px 0 0',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {userTranscript}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Controls Bar */}
            <div style={{
                background: 'rgba(15, 15, 15, 0.95)',
                backdropFilter: 'blur(20px)',
                padding: '16px 0 32px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 24,
            }}>
                {/* Mute Button */}
                <button
                    onClick={toggleMute}
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        backgroundColor: isMuted ? '#fff' : 'rgba(255,255,255,0.12)',
                        color: isMuted ? '#000' : '#fff',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                        {isMuted ? 'mic_off' : 'mic'}
                    </span>
                </button>

                {/* Camera Toggle */}
                <button
                    onClick={toggleCamera}
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        backgroundColor: isCameraOff ? '#fff' : 'rgba(255,255,255,0.12)',
                        color: isCameraOff ? '#000' : '#fff',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                        {isCameraOff ? 'videocam_off' : 'videocam'}
                    </span>
                </button>

                {/* End Call Button */}
                <button
                    onClick={handleEnd}
                    style={{
                        width: 72,
                        height: 56,
                        borderRadius: 28,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 28 }}>
                        call_end
                    </span>
                </button>

                {/* Stop AI Audio */}
                <button
                    onClick={stopAudioPlayback}
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                    }}
                >
                    <span className="material-symbols-rounded" style={{ fontSize: 24 }}>
                        stop_circle
                    </span>
                </button>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes ping {
                    0% { transform: scale(1); opacity: 1; }
                    75%, 100% { transform: scale(1.8); opacity: 0; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
};
