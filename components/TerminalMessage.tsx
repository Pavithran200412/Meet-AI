import React from 'react';
import { Message, Sender, GroundingChunk } from '../types';

interface TerminalMessageProps {
  message: Message;
  onPlayAudio: (text: string) => void;
}

export const TerminalMessage: React.FC<TerminalMessageProps> = ({ message, onPlayAudio }) => {
  const isUser = message.sender === Sender.USER;
  const isSystem = message.sender === Sender.SYSTEM;

  // System Message (Center Chips)
  if (isSystem) {
    return (
      <div className="py-4 flex justify-center animate-slide-up">
        <div className="bg-[#2C2C2C] px-3 py-1 rounded-full text-[11px] font-medium text-gray-400 border border-[#3C3C3C] shadow-sm flex items-center gap-2">
          <span className="material-symbols-rounded text-[14px]">info</span>
          {message.text}
        </div>
      </div>
    );
  }

  // Chat Bubble
  return (
    <div className={`py-2 px-1 flex w-full animate-slide-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Sender Label (Avatar-like) */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1 pl-1">
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
              AI
            </div>
            <span className="text-[11px] text-gray-400 font-medium">Nexus Assistant</span>
          </div>
        )}

        {/* Bubble Container */}
        <div 
          className={`
            relative px-4 py-3 shadow-md text-[15px] leading-relaxed
            ${isUser 
              ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm' 
              : 'bg-[#2C2C2C] text-gray-100 rounded-2xl rounded-tl-sm border border-[#3C3C3C]'
            }
          `}
        >
          {/* Thinking Indicator */}
          {message.isThinking && (
             <div className="flex items-center gap-2 text-purple-300 bg-purple-900/30 px-2 py-1 rounded mb-2 text-xs">
               <span className="material-symbols-rounded animate-spin text-[14px]">psychology</span>
               <span>Thinking...</span>
             </div>
          )}

          {/* Attachments */}
          {message.attachment && (
            <div className="mb-2">
                {message.attachment.type === 'image' ? (
                    <img 
                        src={message.attachment.data} 
                        alt="attachment" 
                        className="rounded-lg max-h-[150px] w-auto border border-white/10"
                    />
                ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg text-sm">
                        <span className="material-symbols-rounded">description</span>
                        <span className="truncate max-w-[150px]">{message.attachment.fileName}</span>
                    </div>
                )}
            </div>
          )}

          {/* Text Content */}
          <div className="whitespace-pre-wrap">{message.text}</div>

          {/* Generated Image */}
          {message.imageData && (
            <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
                <img src={message.imageData} alt="Generated" className="w-full h-auto" />
            </div>
          )}
          
          {/* Grounding Chips */}
          {message.grounding && message.grounding.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.grounding.map((chunk, i) => chunk.web && (
                <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" 
                   className="flex items-center gap-1 bg-black/20 hover:bg-black/40 px-2 py-1 rounded text-[10px] text-blue-200 transition-colors">
                  <span className="material-symbols-rounded text-[12px]">public</span>
                  {chunk.web.title}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp & Actions */}
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-[10px] text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && !message.isThinking && (
            <button onClick={() => onPlayAudio(message.text)} className="text-gray-500 hover:text-white transition-colors">
              <span className="material-symbols-rounded text-[14px]">volume_up</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
