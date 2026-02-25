import React, { useState, useEffect, useRef } from 'react';
import { executeCode } from '../services/compilerService';
import { collabService } from '../services/collaborationService';
import { CollabMessage, Peer } from '../types';

const LANGUAGES = {
  javascript: { name: 'JS', snippet: `console.log("Hello World");` },
  python: { name: 'Python', snippet: `print("Hello World")` },
  typescript: { name: 'TS', snippet: `console.log("Hello TS");` },
  java: { name: 'Java', snippet: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello");\n  }\n}` },
  cpp: { name: 'C++', snippet: `#include <iostream>\nint main() {\n  std::cout << "Hello";\n  return 0;\n}` }
};

type LanguageKey = keyof typeof LANGUAGES;

interface CodeEditorProps {
    onReviewRequest: (code: string, language: string) => Promise<void>;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ onReviewRequest }) => {
  const [language, setLanguage] = useState<LanguageKey>('javascript');
  const [code, setCode] = useState<string>(LANGUAGES.javascript.snippet);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeView, setActiveView] = useState<'edit' | 'console'>('edit');
  const [peers, setPeers] = useState<Peer[]>([]);

  // Collaboration Setup
  useEffect(() => {
    const handleCollabMessage = (msg: CollabMessage) => {
        if (msg.type === 'CODE_UPDATE') {
            // Only update if content is different to minimize cursor disruption
            setCode(prev => {
                if (prev !== msg.payload.code) return msg.payload.code;
                return prev;
            });
        } else if (msg.type === 'LANGUAGE_UPDATE') {
            setLanguage(msg.payload.language);
        }
    };

    const handlePeerUpdate = (activePeers: Peer[]) => {
        setPeers(activePeers);
    };

    collabService.subscribe(handleCollabMessage);
    collabService.subscribeToPeers(handlePeerUpdate);

    return () => {
        collabService.unsubscribe(handleCollabMessage);
        collabService.unsubscribe(handlePeerUpdate);
    };
  }, []);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newCode = e.target.value;
      setCode(newCode);
      collabService.broadcast('CODE_UPDATE', { code: newCode });
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLang = e.target.value as LanguageKey;
      setLanguage(newLang);
      
      const newCode = LANGUAGES[newLang].snippet;
      setCode(newCode);

      collabService.broadcast('LANGUAGE_UPDATE', { language: newLang });
      collabService.broadcast('CODE_UPDATE', { code: newCode });
  };

  const runCode = async () => {
    setIsRunning(true);
    setActiveView('console');
    setOutput(['Running...']);
    
    // Simulate slight delay for "app" feel
    setTimeout(async () => {
        try {
            if (language === 'javascript') {
                const logs: string[] = [];
                const originalLog = console.log;
                console.log = (...args) => logs.push(args.join(' '));
                try { new Function(code)(); } catch (e: any) { logs.push(e.toString()); }
                console.log = originalLog;
                setOutput(logs.length ? logs : ['No output']);
            } else {
                const res = await executeCode(language, code);
                setOutput(res.error ? [res.error] : res.output.split('\n'));
            }
        } catch (e: any) {
            setOutput([`Error: ${e.message}`]);
        } finally {
            setIsRunning(false);
        }
    }, 500);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]">
         <div className="flex items-center gap-3">
             <select 
                value={language}
                onChange={handleLanguageChange}
                className="bg-[#333] text-white text-xs rounded px-2 py-1.5 outline-none border-none font-medium"
             >
                {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
             </select>

             {/* Peer Avatars */}
             <div className="flex items-center -space-x-2">
                {peers.map((peer) => (
                    <div 
                        key={peer.id} 
                        className="w-6 h-6 rounded-full border border-[#252526] flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: peer.color }}
                        title={peer.username}
                    >
                        {peer.username.slice(0, 1)}
                    </div>
                ))}
                {peers.length > 0 && (
                     <div className="w-6 h-6 rounded-full bg-[#333] border border-[#252526] flex items-center justify-center text-[9px] text-gray-400">
                        +{peers.length}
                     </div>
                )}
             </div>
         </div>
         
         <div className="flex gap-2">
             <button 
                onClick={() => onReviewRequest(code, language)}
                className="p-2 text-purple-400 hover:bg-purple-900/20 rounded-full"
                title="AI Review"
             >
                <span className="material-symbols-rounded text-[20px]">smart_toy</span>
             </button>
             <button 
                onClick={runCode}
                disabled={isRunning}
                className="p-2 text-green-400 hover:bg-green-900/20 rounded-full"
                title="Run Code"
             >
                <span className={`material-symbols-rounded text-[20px] ${isRunning ? 'animate-spin' : ''}`}>
                    {isRunning ? 'sync' : 'play_arrow'}
                </span>
             </button>
         </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative">
         <textarea
            value={code}
            onChange={handleCodeChange}
            className={`w-full h-full bg-[#1e1e1e] text-[#d4d4d4] p-4 font-mono text-sm resize-none outline-none leading-relaxed ${activeView === 'console' ? 'hidden' : 'block'}`}
            spellCheck={false}
         />
         
         {/* Console View Overlay */}
         <div className={`absolute inset-0 bg-[#0d0d0d] p-4 font-mono text-sm overflow-auto ${activeView === 'console' ? 'block' : 'hidden'}`}>
             <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
                 <span className="text-gray-500 text-xs uppercase tracking-wider">Console Output</span>
                 <button onClick={() => setActiveView('edit')} className="text-blue-400 text-xs">CLOSE</button>
             </div>
             {output.map((line, i) => (
                 <div key={i} className="text-gray-300 mb-1 break-all">{line}</div>
             ))}
         </div>
      </div>

      {/* View Toggle (Bottom of Editor) */}
      <div className="flex border-t border-[#333]">
          <button 
            onClick={() => setActiveView('edit')}
            className={`flex-1 py-3 text-xs font-medium uppercase tracking-wider ${activeView === 'edit' ? 'text-blue-400 bg-[#2d2d2d]' : 'text-gray-500'}`}
          >
            Editor
          </button>
          <button 
            onClick={() => setActiveView('console')}
            className={`flex-1 py-3 text-xs font-medium uppercase tracking-wider ${activeView === 'console' ? 'text-blue-400 bg-[#2d2d2d]' : 'text-gray-500'}`}
          >
            Console {output.length > 0 && '•'}
          </button>
      </div>
    </div>
  );
};