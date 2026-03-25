import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import OpenAI from "openai";
import { GroundingChunk, Persona } from "../types";
import { createPcmBlob } from "../utils/audioUtils";
import { retrieveContext, recordInterviewFact } from "../utils/ragEngine";
import { mcpClient } from "./mcpClient";
import { streamInterviewQuestion as hfStreamInterview } from "./huggingfaceService";

// Initialize Gemini Client
const apiKey = process.env.API_KEY || "missing_api_key";
const ai = new GoogleGenAI({ apiKey });

// Initialize Hugging Face Inference (For Images)
const hf = new HfInference(process.env.HF_TOKEN || "missing_hf_token");

// Initialize OpenAI Client for HF Router (Fallback - DeepSeek)
const hfRouter = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN || "missing_hf_token",
  dangerouslyAllowBrowser: true
});

const DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-V3.2";

// --- Tools & Types ---

export interface ResumeData {
  data: string;
  mimeType: string;
}

// --- DeepSeek Integration (OpenAI Compatibility Layer) ---

const generateWithDeepSeek = async (
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string, imagePrompt?: string, isCodingChallenge?: boolean } | null> => {
  if (process.env.HF_TOKEN === "missing_hf_token") return null;

  try {
    console.log(`Attempting generation with ${DEEPSEEK_MODEL} via HF Router...`);

    const jsonInstruction = `
        RESPONSE FORMAT: JSON ONLY.
        {
            "content": "string (the interview question)",
            "visual_description": "string | null",
            "is_coding_challenge": "boolean"
        }`;

    const completion = await hfRouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemPrompt + jsonInstruction },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false
    });

    const rawContent = completion.choices[0]?.message?.content || "{}";
    const cleanContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.warn("DeepSeek JSON Parse Failed");
      return { text: rawContent, isCodingChallenge: false };
    }

    return {
      text: parsed.content || rawContent,
      imagePrompt: parsed.visual_description,
      isCodingChallenge: !!parsed.is_coding_challenge
    };
  } catch (e: any) {
    console.warn(`DeepSeek failed:`, e.message);
    return null;
  }
};

// --- Text & Reasoning (Standard API) ---

export const generateInterviewQuestion = async (
  history: string,
  persona: Persona,
  useThinking: boolean = false,
  resume?: ResumeData,
  imageContext?: { mimeType: string; data: string }
): Promise<{ text: string, imagePrompt?: string, grounding?: GroundingChunk[], isCodingChallenge?: boolean }> => {

  if (apiKey === "missing_api_key") {
    return { text: "Error: API Key is missing. Please configure it in your deployment settings." };
  }

  const baseInstruction = persona === Persona.TUTOR
    ? "Role: Friendly AI Coding Tutor. Be encouraging."
    : `Role: Strict Technical Interviewer. 
1. Ask one distinct question at a time.
2. Prioritize resume questions.
3. For coding problems: Title, Description, Examples, Constraints.
4. No full solutions.`;

  let prompt = history;

  // MCP Context Retrieval
  const mcpContext = await retrieveContext(history.slice(-500), "current_session");

  const isPdfResume = resume?.mimeType === 'application/pdf';

  if (resume && !isPdfResume) {
    // Text resume: inject inline as context string
    const cleanResume = resume.data.length > 30000 ? resume.data.substring(0, 30000) + "...(truncated)" : resume.data;
    prompt = `RESUME CONTEXT:\n${cleanResume}\n\nMCP CONTEXT:\n${mcpContext}\n\nINTERVIEW SESSION HISTORY:\n${prompt}`;
  } else {
    prompt = `MCP CONTEXT:\n${mcpContext}\n\nINTERVIEW SESSION HISTORY:\n${prompt}`;
  }

  let systemInstruction = `${baseInstruction}
  
  Output MUST be JSON:
  {
    "content": "string", 
    "visual_description": "string|null", 
    "is_coding_challenge": boolean
  }`;

  try {
    const model = useThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          visual_description: { type: Type.STRING, nullable: true },
          is_coding_challenge: { type: Type.BOOLEAN }
        },
        required: ["content", "is_coding_challenge"]
      },
      // Relax safety settings to allow processing of resume data (which may look like PII)
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    };

    if (useThinking) {
      config.thinkingConfig = { thinkingBudget: 1024 };
    }

    // Build contents: text prompt + optional image + optional PDF resume as inline data
    const parts: any[] = [{ text: prompt }];

    if (isPdfResume && resume) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: resume.data } });
    }

    if (imageContext) {
      parts.push({
        inlineData: {
          mimeType: imageContext.mimeType,
          data: imageContext.data.includes(',') ? imageContext.data.split(',')[1] : imageContext.data
        }
      });
    }

    const contents: any = parts.length === 1 ? prompt : { parts };


    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    const grounding: GroundingChunk[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web) grounding.push({ web: chunk.web });
      });
    }

    // Robust Response Parsing
    const rawText = response.text;

    if (!rawText) {
      // Check for safety blocks
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { text: `System Notice: Response was filtered (${finishReason}). Please rephrase or upload a sanitized resume.` };
      }
      return { text: "System Error: The AI returned an empty response." };
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawText);
    } catch (e) {
      console.warn("JSON Parse Failed, attempting manual cleanup");
      // Fallback: Try to find JSON object within text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsedResponse = JSON.parse(match[0]);
        } catch (e2) {
          // If still failing, return raw text as content
          return { text: rawText, isCodingChallenge: false };
        }
      } else {
        return { text: rawText, isCodingChallenge: false };
      }
    }

    const result = {
      text: parsedResponse.content || "I reviewed your resume. Ready to proceed.",
      imagePrompt: parsedResponse.visual_description,
      grounding,
      isCodingChallenge: !!parsedResponse.is_coding_challenge
    };

    // Persist a brief memory fact so future questions have context
    const snippet = result.text.slice(0, 120).replace(/\n/g, ' ');
    recordInterviewFact("current_session", snippet);

    return result;

  } catch (error: any) {
    console.error("Gemini API Error:", error);

    // Fallback 1: DeepSeek via HF Router
    const deepSeekFallback = await generateWithDeepSeek(baseInstruction, prompt);
    if (deepSeekFallback) {
      return {
        ...deepSeekFallback,
        text: deepSeekFallback.text
      };
    }

    // Fallback 2: HuggingFace Inference (Mistral)
    try {
      console.log("Falling back to HuggingFace Inference...");
      const hfResult = await hfStreamInterview(prompt, persona);
      return { ...hfResult, grounding: [] };
    } catch (hfError: any) {
      console.warn("HuggingFace fallback also failed:", hfError.message);
    }

    return { text: `Connection Error: ${error.message || "Please check your network."}` };
  }
};

export const fastAck = async (input: string): Promise<string> => {
  if (apiKey === "missing_api_key") return "...";
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Ack in 3 words: ${input}`,
      config: { maxOutputTokens: 20 }
    });
    return response.text || "Acknowledged.";
  } catch (e) {
    return "...";
  }
};

// --- Live API (Real-time Audio) ---

export interface LiveSessionConfig {
  onOpen: () => void;
  onAudioData: (base64: string) => void;
  onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void;
  onClose: () => void;
  onError: (err: any) => void;
  onInterrupted: () => void;
  persona: Persona;
}

export const connectToLiveSession = async (config: LiveSessionConfig) => {
  if (apiKey === "missing_api_key") {
    config.onError(new Error("API Key missing"));
    return { sendAudioChunk: () => { }, disconnect: () => { } };
  }

  const model = 'gemini-2.5-flash-native-audio-preview-12-2025';

  const systemInstruction = config.persona === Persona.TUTOR
    ? "Role: Patient Coding Tutor. Concise answers."
    : "Role: Strict Interviewer. One short question at a time. Interrupt if needed.";

  const sessionPromise = ai.live.connect({
    model,
    callbacks: {
      onopen: () => {
        config.onOpen();
      },
      onmessage: (message: LiveServerMessage) => {
        const serverContent = message.serverContent;

        // Handle Audio Output
        const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          config.onAudioData(audioData);
        }

        // Handle Transcripts
        // CRITICAL: Handle turnComplete independently of text to ensure buffers are cleared
        if (serverContent?.outputTranscription) {
          config.onTranscript(serverContent.outputTranscription.text || "", false, !!serverContent.turnComplete);
        } else if (serverContent?.turnComplete) {
          config.onTranscript("", false, true);
        }

        if (serverContent?.inputTranscription) {
          // Pass false for isFinal to allow the UI to handle the turn logic
          config.onTranscript(serverContent.inputTranscription.text || "", true, false);
        }

        // Handle Interruption
        if (serverContent?.interrupted) {
          config.onInterrupted();
        }
      },
      onclose: () => {
        config.onClose();
      },
      onerror: (err) => {
        config.onError(err);
      }
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: systemInstruction }] }
    }
  });

  return {
    sendAudioChunk: (data: Float32Array) => {
      const blob = createPcmBlob(data);
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: blob });
      });
    },
    disconnect: () => {
      sessionPromise.then(session => session.close());
    }
  };
};

// --- Image Generation ---

export const generateImage = async (prompt: string): Promise<string> => {
  if (apiKey === "missing_api_key") throw new Error("API Key missing");

  // 1. Primary: Gemini 2.5 Flash Image (Fast, Native)
  try {
    console.log("Generating with Gemini 2.5 Flash Image...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  } catch (error: any) {
    console.warn("Gemini 2.5 Flash Image Error:", error.message);
  }

  // 2. Secondary: Imagen 3 (High Quality)
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9',
      },
    });
    const b64 = response.generatedImages?.[0]?.image?.imageBytes;
    if (b64) return `data:image/jpeg;base64,${b64}`;
  } catch (e: any) {
    console.warn("Imagen 3.0 Error:", e.message);
  }

  // 3. Last Resort: Hugging Face
  const hfModels = ["runwayml/stable-diffusion-v1-5"];
  for (const model of hfModels) {
    try {
      if (process.env.HF_TOKEN === "missing_hf_token") continue;
      const blob = await hf.textToImage({
        model: model,
        inputs: prompt,
        parameters: { negative_prompt: "blurry" }
      });
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob as unknown as Blob);
      });
    } catch (error: any) {
      console.warn(`HF Error (${model}):`, error.message);
    }
  }
  throw new Error("Failed to generate visualization.");
};

// --- Code Execution & Review ---

export const runCodeWithAI = async (language: string, code: string): Promise<string> => {
  if (apiKey === "missing_api_key") return "Error: API Key missing.";
  try {
    const prompt = `Act as a compiler for ${language}. Execute: ${code}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    let text = response.text || "";
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    return text.trim() || "[No Output]";
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
};

export const reviewCodeWithAI = async (language: string, code: string): Promise<string> => {
  if (apiKey === "missing_api_key") return "Error: API Key missing.";

  const rubric = await mcpClient.getRubric(language);
  const prompt = `Review this ${language} code based on the following rubric:\n${rubric}\n\nCODE:\n${code}`;

  try {
    const deepSeekReview = await generateWithDeepSeek(
      "Expert Reviewer. Concise.",
      prompt + "\nJSON Output: { content: 'string' }"
    );
    if (deepSeekReview) return deepSeekReview.text;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt
    });
    return response.text || "No feedback.";
  } catch (error: any) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      return response.text || "No feedback.";
    } catch (fallbackError: any) {
      return `Error: ${fallbackError.message}`;
    }
  }
};

// --- Maps Grounding ---
export const getGeographicContext = async (query: string, lat?: number, lng?: number): Promise<{ text: string, grounding: GroundingChunk[] }> => {
  if (apiKey === "missing_api_key") return { text: "API Key missing.", grounding: [] };
  try {
    const config: any = { tools: [{ googleMaps: {} }] };
    if (lat && lng) {
      config.toolConfig = { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } };
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config
    });
    const grounding: GroundingChunk[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.maps) grounding.push({ maps: chunk.maps });
        if (chunk.web) grounding.push({ web: chunk.web });
      });
    }
    return { text: response.text || "No location info.", grounding };
  } catch (e) {
    return { text: "Geographic context currently unavailable.", grounding: [] };
  }
};

// --- Live API ---
export const getLiveSession = () => {
  return ai.live;
};