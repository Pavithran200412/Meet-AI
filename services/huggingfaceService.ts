import { HfInference } from "@huggingface/inference";
import { Persona } from "../types";

// Initialize Hugging Face Inference Client
const getHfClient = () => {
    const token = (typeof process !== 'undefined' && process.env?.HF_TOKEN) || "missing_hf_token";
    return new HfInference(token);
};

const HF_CHAT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

// --- Streaming Chat Completion ---

export const generateWithHuggingFace = async (
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (text: string) => void
): Promise<string> => {
    const hf = getHfClient();
    let fullText = "";

    try {
        const stream = hf.chatCompletionStream({
            model: HF_CHAT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 1024,
            temperature: 0.7,
        });

        for await (const chunk of stream) {
            if (chunk.choices && chunk.choices.length > 0) {
                const newContent = chunk.choices[0].delta.content || "";
                fullText += newContent;
                onChunk?.(newContent);
            }
        }

        return fullText || "No response generated.";
    } catch (error: any) {
        console.error("HuggingFace Inference Error:", error.message);
        throw new Error(`HuggingFace Error: ${error.message}`);
    }
};

// --- Interview-Specific Wrapper ---

export const streamInterviewQuestion = async (
    history: string,
    persona: Persona,
    onChunk?: (text: string) => void
): Promise<{ text: string; isCodingChallenge: boolean; imagePrompt?: string }> => {
    const systemPrompt = persona === Persona.TUTOR
        ? `Role: Friendly AI Coding Tutor. Be encouraging and educational.
       Respond naturally with clear explanations.
       If asked a coding question, provide helpful guidance without full solutions.`
        : `Role: Strict Technical Interviewer.
       1. Ask one distinct question at a time.
       2. Be concise and professional.
       3. For coding problems: provide Title, Description, Examples, and Constraints.
       4. Never reveal full solutions.`;

    const jsonInstruction = `

CRITICAL: Your response MUST be valid JSON with this exact format:
{
  "content": "your interview question or response here",
  "visual_description": null,
  "is_coding_challenge": false
}
Do NOT include any text outside the JSON object.`;

    try {
        const rawText = await generateWithHuggingFace(
            systemPrompt + jsonInstruction,
            `INTERVIEW SESSION:\n${history}`,
            onChunk
        );

        // Parse JSON response
        const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed;
        try {
            parsed = JSON.parse(cleanText);
        } catch (e) {
            // Try to extract JSON from the response
            const match = cleanText.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch (e2) {
                    return { text: rawText, isCodingChallenge: false };
                }
            } else {
                return { text: rawText, isCodingChallenge: false };
            }
        }

        return {
            text: parsed.content || rawText,
            imagePrompt: parsed.visual_description || undefined,
            isCodingChallenge: !!parsed.is_coding_challenge
        };
    } catch (error: any) {
        throw new Error(`Interview generation failed: ${error.message}`);
    }
};
