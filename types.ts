export enum Sender {
  USER = 'USER',
  AI = 'AI',
  SYSTEM = 'SYSTEM'
}

export enum InterviewMode {
  TEXT = 'TEXT', // Standard coding round
  VOICE = 'VOICE', // Live API phone screen
  ANALYSIS = 'ANALYSIS' // Deep thinking evaluation
}

export enum Persona {
  INTERVIEWER = 'INTERVIEWER',
  TUTOR = 'TUTOR'
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { 
    uri: string; 
    title: string; 
    placeAnswerSources?: { reviewSnippets?: { text: string }[] }[] 
  };
}

export interface Attachment {
  type: 'image' | 'file';
  mimeType: string;
  data: string; // Base64 data URL for images, text content for files
  fileName: string;
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;
  timestamp: number;
  isAudio?: boolean;
  audioData?: string; // Base64
  imageData?: string; // Base64 Data URL for generated images
  grounding?: GroundingChunk[];
  isThinking?: boolean;
  attachment?: Attachment;
}

export interface AudioDeviceConfig {
  sampleRate: number;
  numChannels: number;
}

// Collaboration Types
export type CollabEventType = 'CODE_UPDATE' | 'LANGUAGE_UPDATE' | 'PRESENCE' | 'CURSOR_UPDATE' | 'MCP_EVENT';

export interface CollabMessage {
  type: CollabEventType;
  payload: any;
  senderId: string;
  timestamp: number;
}

export interface Peer {
  id: string;
  lastSeen: number;
  username: string;
  color: string;
}