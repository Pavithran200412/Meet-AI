export interface ExecutionResult {
  output: string;
  error?: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  typescript: 'typescript',
  java: 'java',
  cpp: 'c++',
  go: 'go',
  rust: 'rust',
  sql: 'sqlite3',
  javascript: 'javascript'
};

export const executeCode = async (languageKey: string, sourceCode: string): Promise<ExecutionResult> => {
  const runtime = LANGUAGE_MAP[languageKey];
  if (!runtime) {
    return { output: '', error: `Language '${languageKey}' not supported by online compiler.` };
  }

  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: runtime,
        version: '*',
        files: [{ content: sourceCode }]
      })
    });

    if (!response.ok) {
        return { output: '', error: `Compiler API Error: ${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    
    // Check for API-level errors
    if (data.message) {
        return { output: '', error: data.message };
    }

    // Piston returns { run: { output: "...", stderr: "...", code: 0 } }
    // 'output' usually combines stdout and stderr.
    return {
        output: data.run.output || '',
        error: undefined
    };

  } catch (e: any) {
    return { output: '', error: `Network Error: ${e.message}` };
  }
};