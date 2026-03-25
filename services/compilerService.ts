export interface ExecutionResult {
  output: string;
  error?: string;
}

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: 'python', version: '3.10.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'c++', version: '10.2.0' },
  go: { language: 'go', version: '1.16.2' },
  rust: { language: 'rust', version: '1.68.2' },
  sql: { language: 'sqlite3', version: '3.36.0' },
  javascript: { language: 'javascript', version: '18.15.0' }
};

// Public Piston API endpoints (fallback chain)
const PISTON_ENDPOINTS = [
  'https://emkc.org/api/v2/piston/execute',
  'https://piston-api.fly.dev/api/v2/execute',
];

export const executeCode = async (languageKey: string, sourceCode: string): Promise<ExecutionResult> => {
  const runtime = LANGUAGE_MAP[languageKey];
  if (!runtime) {
    return { output: '', error: `Language '${languageKey}' not supported by online compiler.` };
  }

  const payload = {
    language: runtime.language,
    version: runtime.version,
    files: [{ content: sourceCode }]
  };

  // Try each Piston endpoint
  for (const endpoint of PISTON_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn(`Piston endpoint ${endpoint} returned ${response.status}, trying next...`);
        continue;
      }

      const data = await response.json();

      if (data.message) {
        return { output: '', error: data.message };
      }

      return {
        output: data.run?.output || '',
        error: data.run?.stderr || undefined
      };
    } catch (e: any) {
      console.warn(`Piston endpoint ${endpoint} failed: ${e.message}`);
      continue;
    }
  }

  // All Piston endpoints failed — fall back to AI-simulated execution
  try {
    const { runCodeWithAI } = await import('./geminiService');
    const result = await runCodeWithAI(languageKey, sourceCode);
    return { output: `[AI Simulated Output]\n${result}` };
  } catch (aiErr: any) {
    return { output: '', error: `All execution methods failed. Last error: ${aiErr.message}` };
  }
};