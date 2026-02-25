import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    generateInterviewQuestion,
    generateImage,
    connectToLiveSession,
    reviewCodeWithAI,
    ResumeData
} from './services/geminiService';
import { decodeAudioData, downsampleBuffer } from './utils/audioUtils';
import { TerminalMessage } from './components/TerminalMessage';
import { CodeEditor } from './components/CodeEditor';
import { AudioVisualizer } from './components/AudioVisualizer';
import { Message, Sender, InterviewMode, Persona, Attachment } from './types';

const App: React.FC = () => {
    // Navigation State
    const [activeTab, setActiveTab] = useState<'chat' | 'code'>('chat');

    // App Logic State
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [mode, setMode] = useState<InterviewMode>(InterviewMode.TEXT);
    const [persona, setPersona] = useState<Persona>(Persona.INTERVIEWER);
    const [isLiveConnected, setIsLiveConnected] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [resumeData, setResumeData] = useState<ResumeData | undefined>(undefined);
    const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const liveSessionRef = useRef<any>(null);
    const nextStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const currentTurnTextRef = useRef<string>("");
    const userSpeechBufferRef = useRef<string>("");

    // Init
    useEffect(() => {
        // Immediate welcome message for perceived speed
        addMessage(Sender.AI, "Welcome. I am your Nexus AI Assistant. Ready for your technical assessment.");

        return () => { if (audioContextRef.current) audioContextRef.current.close(); };
    }, []);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading, pendingAttachment, activeTab, isUserSpeaking]);

    const addMessage = (sender: Sender, text: string, grounding?: any[], isThinking = false, imageData?: string, attachment?: Attachment) => {
        const id = uuidv4();
        setMessages(prev => [...prev, {
            id,
            sender,
            text,
            timestamp: Date.now(),
            grounding,
            isThinking,
            imageData,
            attachment
        }]);
        return id;
    };

    const updateLastMessage = (text: string, sender: Sender) => {
        setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === sender) {
                return [...prev.slice(0, -1), { ...last, text: text }];
            } else {
                return [...prev, { id: uuidv4(), sender, text, timestamp: Date.now() }];
            }
        });
    };

    const playTTS = (text: string) => {
        if (!synthRef.current || mode === InterviewMode.VOICE) return;
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`_]/g, ''));
        const voices = synthRef.current.getVoices();
        const preferred = voices.find(v => v.name.includes('Google US English') || v.lang === 'en-US');
        if (preferred) utterance.voice = preferred;
        synthRef.current.speak(utterance);
    };

    // --- Voice Logic ---
    const stopAudioPlayback = () => {
        // Stop Web Audio API sources (Live API)
        audioSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) { } });
        audioSourcesRef.current = [];

        // Stop Browser TTS
        if (synthRef.current) {
            synthRef.current.cancel();
        }
    };

    const commitUserTurn = () => {
        if (userSpeechBufferRef.current.trim().length > 0) {
            addMessage(Sender.USER, userSpeechBufferRef.current);
            userSpeechBufferRef.current = "";
        }
        setIsUserSpeaking(false);
    };

    const handleTextSubmit = async (e?: React.FormEvent, overrideText?: string) => {
        e?.preventDefault();
        const textToSend = overrideText || inputValue;
        if (!textToSend.trim() && !pendingAttachment) return;

        const attachment = pendingAttachment;
        setPendingAttachment(null);
        if (!overrideText) setInputValue('');

        addMessage(Sender.USER, textToSend, undefined, undefined, undefined, attachment || undefined);

        if (textToSend.toLowerCase() === '/code') {
            setActiveTab('code');
            addMessage(Sender.SYSTEM, "Switched to Workspace");
            return;
        }

        setIsLoading(true);

        const history = messages.slice(-6).filter(m => !m.imageData).map(m => `${m.sender}: ${m.text}`).join('\n');
        let promptToSend = textToSend;
        let imageContext: { mimeType: string; data: string } | undefined;

        if (attachment) {
            if (attachment.type === 'image') {
                imageContext = { mimeType: attachment.mimeType, data: attachment.data };
                promptToSend += `\n[User attached an image]`;
            } else {
                promptToSend += `\n\n[FILE: ${attachment.fileName}]\n${attachment.data}`;
            }
        }

        try {
            const response = await generateInterviewQuestion(
                history + `\nUSER: ${promptToSend}`,
                persona,
                false,
                resumeData,
                imageContext
            );

            setIsLoading(false);
            const msgId = addMessage(Sender.AI, response.text, response.grounding);
            playTTS(response.text);

            if (response.isCodingChallenge) {
                setActiveTab('code');
                addMessage(Sender.SYSTEM, "Coding Challenge Started - Workspace Active");
            }

            if (response.imagePrompt) {
                generateImage(response.imagePrompt)
                    .then(url => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, imageData: url } : m)))
                    .catch(console.error);
            }
        } catch (e: any) {
            setIsLoading(false);
            addMessage(Sender.SYSTEM, `Error: ${e.message}`);
        }
    };

    const handleCodeReviewRequest = async (code: string, language: string) => {
        setActiveTab('chat');
        addMessage(Sender.USER, `Submitted ${language} solution for review.`);
        setIsLoading(true);
        addMessage(Sender.SYSTEM, "Analyzing Solution...");
        try {
            const feedback = await reviewCodeWithAI(language, code);
            setIsLoading(false);
            addMessage(Sender.AI, feedback);
            playTTS(feedback);
        } catch (e: any) {
            setIsLoading(false);
            addMessage(Sender.SYSTEM, `Review Error: ${e.message}`);
        }
    };

    const toggleVoiceMode = async () => {
        if (mode === InterviewMode.VOICE) {
            setMode(InterviewMode.TEXT);
            setIsLiveConnected(false);
            setIsUserSpeaking(false);
            commitUserTurn(); // Commit any pending text if mode is toggled off
            if (liveSessionRef.current) { liveSessionRef.current.disconnect(); liveSessionRef.current = null; }
            if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
            if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
            if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(track => track.stop()); mediaStreamRef.current = null; }
            stopAudioPlayback();
            if (audioContextRef.current) { await audioContextRef.current.close(); audioContextRef.current = null; }
        } else {
            try {
                setMode(InterviewMode.VOICE);
                currentTurnTextRef.current = "";
                userSpeechBufferRef.current = "";
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContextClass({ sampleRate: 24000 });
                audioContextRef.current = ctx;
                nextStartTimeRef.current = ctx.currentTime;

                const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
                mediaStreamRef.current = stream;

                const session = await connectToLiveSession({
                    persona,
                    onOpen: () => setIsLiveConnected(true),
                    onAudioData: (base64) => {
                        // When audio data arrives, it means the model is replying.
                        // This is a strong signal that the user's turn is complete.
                        if (isUserSpeaking || userSpeechBufferRef.current) {
                            commitUserTurn();
                        }

                        if (!audioContextRef.current) return;
                        try {
                            const buffer = decodeAudioData(base64, audioContextRef.current, 24000);
                            const source = audioContextRef.current.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioContextRef.current.destination);
                            const now = audioContextRef.current.currentTime;
                            const startTime = Math.max(now, nextStartTimeRef.current);
                            source.start(startTime);
                            nextStartTimeRef.current = startTime + buffer.duration;
                            source.onended = () => { const idx = audioSourcesRef.current.indexOf(source); if (idx > -1) audioSourcesRef.current.splice(idx, 1); };
                            audioSourcesRef.current.push(source);
                        } catch (e) { console.error(e); }
                    },
                    onTranscript: (text, isUser, isFinal) => {
                        if (isUser) {
                            // Accumulate user text silently
                            userSpeechBufferRef.current += text;
                            // Show speaking animation
                            setIsUserSpeaking(true);
                            // Do NOT add to messages yet
                        } else {
                            // AI is speaking/generating text
                            // Ensure user turn is committed if not already
                            if (isUserSpeaking || userSpeechBufferRef.current) {
                                commitUserTurn();
                            }

                            currentTurnTextRef.current += text;
                            updateLastMessage(currentTurnTextRef.current, Sender.AI);
                            if (isFinal) currentTurnTextRef.current = "";
                        }
                    },
                    onInterrupted: () => {
                        stopAudioPlayback();
                        nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
                        currentTurnTextRef.current = "";

                        // If interrupted, assume user is speaking now
                        setIsUserSpeaking(true);
                        userSpeechBufferRef.current = ""; // Reset buffer as user is starting over/interrupting
                    },
                    onClose: () => setIsLiveConnected(false),
                    onError: (err) => { console.error(err); toggleVoiceMode(); }
                });

                liveSessionRef.current = session;
                const source = ctx.createMediaStreamSource(stream);
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
            } catch (e) { setMode(InterviewMode.TEXT); }
        }
    };

    // Read a File as a raw base64 string (no data: prefix)
    const readFileAsBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });


    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            let attachment: Attachment | null = null;
            if (file.type.startsWith('image/')) {
                const dataUrl = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file); });
                attachment = { type: 'image', mimeType: file.type, data: dataUrl, fileName: file.name };
            } else if (file.type === 'application/pdf') {
                addMessage(Sender.SYSTEM, "Reading PDF...");
                // Pass PDF directly to Gemini as base64 inline data — no client-side parsing needed
                const base64 = await readFileAsBase64(file);
                attachment = { type: 'file', mimeType: 'application/pdf', data: base64, fileName: file.name };
                if (!resumeData) {
                    setResumeData({ data: base64, mimeType: 'application/pdf' });
                    addMessage(Sender.SYSTEM, "Resume PDF Loaded. Reviewing it now...");
                    setIsLoading(true);
                    generateInterviewQuestion("Start the interview based on this resume.", persona, false, { data: base64, mimeType: 'application/pdf' })
                        .then(res => {
                            setIsLoading(false);
                            addMessage(Sender.AI, res.text, res.grounding);
                            playTTS(res.text);
                        })
                        .catch(() => setIsLoading(false));
                }
            } else {
                const text = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsText(file); });
                attachment = { type: 'file', mimeType: file.type, data: text, fileName: file.name };
                if (!resumeData && (text.includes("Experience") || text.includes("Education") || text.includes("Skills"))) {
                    setResumeData({ data: text, mimeType: 'text/plain' });
                    addMessage(Sender.SYSTEM, "Resume Context Loaded");
                }
            }

            if (attachment) {
                setPendingAttachment(attachment);
            }
        } catch (err: any) {
            addMessage(Sender.SYSTEM, "Upload Failed");
        }
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    return (
        <div className="h-[100dvh] bg-[#121212] text-[#E3E3E3] flex flex-col overflow-hidden font-sans">

            {/* 1. App Bar (Material Style) */}
            <header className="bg-[#1E1E1E] shadow-md px-4 py-3 flex items-center justify-between shrink-0 z-20 material-elevation-2 relative min-h-[64px]">
                {mode === InterviewMode.VOICE ? (
                    <div className="flex items-center justify-between w-full animate-slide-up">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center transition-colors">
                                {isUserSpeaking ? (
                                    <span className="material-symbols-rounded text-red-500 animate-pulse">graphic_eq</span>
                                ) : (
                                    <span className="material-symbols-rounded text-red-500 text-[24px]">mic</span>
                                )}
                            </div>
                            <div className="flex flex-col h-10 justify-center">
                                <h1 className="text-[16px] font-bold tracking-tight text-white leading-tight">Live Interview</h1>
                                <div className="h-4 flex items-center">
                                    {isUserSpeaking ? (
                                        <AudioVisualizer isActive={true} width={120} height={16} barColor="#f87171" />
                                    ) : (
                                        <span className="text-[10px] text-red-400 font-medium tracking-wide uppercase">{isLiveConnected ? 'Listening' : 'Connecting...'}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={toggleVoiceMode}
                            className="bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/50 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all active:scale-95"
                        >
                            <span className="material-symbols-rounded text-[18px]">call_end</span>
                            <span>END</span>
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-500 to-purple-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg">
                                <span className="material-symbols-rounded text-white text-[20px]">code_blocks</span>
                            </div>
                            <div>
                                <h1 className="text-[16px] font-bold tracking-tight text-white leading-tight">Nexus AI</h1>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    <span className="text-[10px] text-gray-400 font-medium">ONLINE</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {resumeData && <span className="material-symbols-rounded text-green-400 text-[20px]" title="Resume Loaded">description</span>}

                            <button
                                onClick={() => setPersona(persona === Persona.INTERVIEWER ? Persona.TUTOR : Persona.INTERVIEWER)}
                                className="bg-[#2C2C2C] text-[10px] font-bold px-3 py-1.5 rounded-full border border-[#3C3C3C] text-gray-300 active:bg-[#3C3C3C] transition-colors"
                            >
                                {persona} MODE
                            </button>
                        </div>
                    </>
                )}
            </header>

            {/* 2. Body Area */}
            <div className="flex-1 relative overflow-hidden">

                {/* Chat Screen */}
                <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ${activeTab === 'chat' ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className={`flex-1 overflow-y-auto p-4 space-y-4 pb-24 bg-[#121212]`}>
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-4 opacity-50">
                                <span className="material-symbols-rounded text-6xl">forum</span>
                                <p className="text-sm font-medium">Start your interview session</p>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <TerminalMessage key={msg.id} message={msg} onPlayAudio={playTTS} />
                        ))}

                        {/* User Speaking Bubble - Visual indicator instead of real-time text */}
                        {isUserSpeaking && (
                            <div className="py-2 px-1 flex w-full justify-end animate-slide-up">
                                <div className="max-w-[85%] sm:max-w-[70%] flex flex-col items-end">
                                    <div className="bg-blue-600/80 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md flex items-center gap-2 min-h-[44px]">
                                        <span className="text-xs font-medium opacity-80 mr-1">Listening</span>
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-duration:0.6s]" style={{ animationDelay: '0ms' }}></div>
                                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-duration:0.6s]" style={{ animationDelay: '150ms' }}></div>
                                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-duration:0.6s]" style={{ animationDelay: '300ms' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isLoading && !isUserSpeaking && (
                            <div className="flex justify-start px-2 py-2">
                                <div className="bg-[#2C2C2C] px-4 py-2 rounded-full rounded-tl-sm flex gap-1 items-center">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                </div>

                {/* Code Screen */}
                <div className={`absolute inset-0 bg-[#0d1117] transition-transform duration-300 ${activeTab === 'code' ? 'translate-x-0' : 'translate-x-full'}`}>
                    <CodeEditor onReviewRequest={handleCodeReviewRequest} />
                </div>
            </div>

            {/* 3. Input Area (Always visible even in Voice Mode, allowing text/coding) */}
            <div className={`bg-[#1E1E1E] p-3 border-t border-[#2C2C2C] transition-transform duration-300 ${activeTab === 'chat' ? 'translate-y-0' : 'translate-y-full absolute bottom-0 w-full'}`}>
                {pendingAttachment && (
                    <div className="mx-2 mb-2 p-2 bg-[#2C2C2C] rounded-lg flex items-center justify-between border border-[#3C3C3C]">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className="material-symbols-rounded text-blue-400 text-sm">attachment</span>
                            <span className="text-xs text-gray-300 truncate">{pendingAttachment.fileName}</span>
                        </div>
                        <button onClick={() => setPendingAttachment(null)} className="text-gray-500 hover:text-red-400">
                            <span className="material-symbols-rounded text-sm">close</span>
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 text-gray-400 hover:text-white rounded-full hover:bg-[#2C2C2C] transition-colors flex-shrink-0">
                        <span className="material-symbols-rounded">attach_file</span>
                    </button>

                    <button
                        onClick={stopAudioPlayback}
                        className="p-3 text-red-400 hover:text-red-300 rounded-full hover:bg-[#2C2C2C] transition-colors flex-shrink-0"
                        title="Stop Audio"
                    >
                        <span className="material-symbols-rounded">stop_circle</span>
                    </button>

                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.txt,.js,.ts,.py" />

                    <form onSubmit={(e) => handleTextSubmit(e)} className="flex-1 bg-[#2C2C2C] rounded-3xl border border-[#3C3C3C] focus-within:border-gray-500 transition-colors flex items-center px-4 py-2 min-h-[48px]">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Message..."
                            className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 text-[15px]"
                            disabled={isLoading}
                        />
                    </form>

                    <button
                        onClick={(e) => inputValue.trim() ? handleTextSubmit(e, inputValue) : toggleVoiceMode()}
                        className={`p-3 rounded-full shadow-lg transition-transform active:scale-95 flex items-center justify-center flex-shrink-0 ${inputValue.trim() ? 'bg-blue-600 text-white' : 'bg-[#2C2C2C] text-white border border-[#3C3C3C]'}`}
                    >
                        <span className="material-symbols-rounded">
                            {inputValue.trim() ? 'send' : 'mic'}
                        </span>
                    </button>
                </div>
            </div>

            {/* 4. Bottom Navigation Bar */}
            <nav className="bg-[#1E1E1E] border-t border-[#2C2C2C] pb-safe">
                <div className="flex justify-around items-center h-16">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'chat' ? 'text-blue-400' : 'text-gray-500'}`}
                    >
                        <span className={`material-symbols-rounded transition-transform ${activeTab === 'chat' ? 'scale-110 fill-current' : ''}`}>chat_bubble</span>
                        <span className="text-[10px] font-medium">Interview</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('code')}
                        className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'code' ? 'text-blue-400' : 'text-gray-500'}`}
                    >
                        <span className={`material-symbols-rounded transition-transform ${activeTab === 'code' ? 'scale-110 fill-current' : ''}`}>terminal</span>
                        <span className="text-[10px] font-medium">Workspace</span>
                    </button>
                </div>
            </nav>
        </div>
    );
};

export default App;