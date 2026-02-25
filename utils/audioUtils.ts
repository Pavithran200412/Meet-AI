import { Blob } from '@google/genai';

// --- Audio Playback Utils ---

export const decodeAudioData = (
  base64String: string,
  ctx: AudioContext,
  sampleRate: number = 24000
): AudioBuffer => {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Gemini sends 16-bit PCM, Little Endian
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < dataInt16.length; i++) {
    // Convert Int16 to Float32 [-1.0, 1.0]
    channelData[i] = dataInt16[i] / 32768.0;
  }

  return buffer;
};

// --- Audio Recording Utils ---

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const float32ToInt16 = (float32: Float32Array): Int16Array => {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
};

// Downsample buffer from Microphone rate (e.g. 44.1k/48k) to 16k for Gemini
export const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number = 16000): Float32Array => {
  if (inputRate === outputRate) return buffer;
  
  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  
  let offsetResult = 0;
  let offsetBuffer = 0;
  
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    
    // Simple averaging (linear interpolation or decimation)
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  
  return result;
};

export const createPcmBlob = (data: Float32Array): Blob => {
  const int16Data = float32ToInt16(data);
  const base64 = bytesToBase64(new Uint8Array(int16Data.buffer));
  
  return {
    data: base64,
    mimeType: "audio/pcm;rate=16000",
  };
};