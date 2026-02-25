import { GoogleGenAI } from "@google/genai";

// Gemini client (reuse same key as geminiService)
const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

// GitHub token for higher rate limits (optional)
const githubToken = process.env.GITHUB_TOKEN || "";

// ─── Session Memory (sessionStorage) ─────────────────────────────────────────

const MEMORY_PREFIX = "mcp_memory_";

interface MemoryFact {
  timestamp: number;
  fact: string;
}

function memoryKey(sessionId: string) {
  return `${MEMORY_PREFIX}${sessionId}`;
}

function readMemory(sessionId: string): MemoryFact[] {
  try {
    const raw = sessionStorage.getItem(memoryKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeMemory(sessionId: string, facts: MemoryFact[]) {
  try {
    // Keep last 20 facts to avoid bloat
    const trimmed = facts.slice(-20);
    sessionStorage.setItem(memoryKey(sessionId), JSON.stringify(trimmed));
  } catch {
    // sessionStorage full — ignore
  }
}

// ─── Rubrics (per language/topic) ────────────────────────────────────────────

const RUBRICS: Record<string, string> = {
  javascript: `JavaScript Code Rubric:
  - Correctness (3pts): Output matches expected, edge cases handled
  - Code Quality (2pts): Clean variable names, no dead code, DRY
  - Performance (2pts): Avoids O(n²) when O(n) is possible, no unnecessary re-renders
  - Error Handling (1pt): try/catch where appropriate, validates input
  - ES6+ Usage (2pts): Uses modern syntax (destructuring, spread, optional chaining)`,

  typescript: `TypeScript Code Rubric:
  - Correctness (3pts): Output is accurate, all test cases pass
  - Type Safety (3pts): No 'any' types, proper interfaces/generics used
  - Code Quality (2pts): Clean, readable, DRY
  - Error Handling (2pts): Handles nullable types, runtime errors caught`,

  python: `Python Code Rubric:
  - Correctness (3pts): Produces correct output for all cases
  - Pythonic Style (2pts): Uses list comprehensions, generators, context managers where appropriate
  - Performance (2pts): Appropriate data structures (dict for O(1) lookup, etc.)
  - Readability (2pts): PEP8 compliant, meaningful names, docstrings
  - Error Handling (1pt): raises exceptions with clear messages`,

  java: `Java Code Rubric:
  - Correctness (3pts): Correct output, handles edge cases
  - OOP Design (2pts): Appropriate use of classes, interfaces, and encapsulation
  - Code Quality (2pts): Follows Java naming conventions, no code smell
  - Performance (2pts): Efficient data structures, avoids unnecessary object creation
  - Exception Handling (1pt): Checked exceptions handled or declared`,

  go: `Go Code Rubric:
  - Correctness (3pts): Produces expected output
  - Idiomatic Go (3pts): Error handling with (value, err) pattern, no panic in lib code
  - Performance (2pts): Minimal allocations, goroutines used appropriately
  - Readability (2pts): Short, clear function names, proper comments`,

  react: `React / Frontend Code Rubric:
  - Correctness (3pts): Component renders correctly, props/state work as expected
  - Component Design (2pts): Single responsibility, reusable, proper prop types
  - State Management (2pts): Minimal state, correct hook usage (useEffect deps, etc.)
  - Performance (2pts): Avoids unnecessary re-renders, uses memo/callback when needed
  - Accessibility (1pt): Semantic HTML, aria attributes where appropriate`,

  algorithms: `Algorithms & Data Structures Rubric:
  - Correctness (4pts): Handles all cases including edge cases
  - Time Complexity (3pts): Optimal or near-optimal time complexity (explain Big-O)
  - Space Complexity (2pts): Efficient memory usage
  - Code Clarity (1pt): Steps and logic are easy to follow`,

  "system-design": `System Design Rubric:
  - Requirements Clarification (2pts): Asked about scale, constraints, and use cases
  - High-Level Design (3pts): Clear system diagram with key components
  - Data Model (2pts): Appropriate database choice, schema design
  - Scalability (2pts): Horizontal scaling, caching, load balancing considered
  - Trade-offs (1pt): Acknowledged CAP theorem, consistency vs availability`,

  general: `General Technical Rubric:
  - Problem Understanding (2pts): Correctly interprets the problem
  - Approach (3pts): Logical, well-structured solution
  - Code Quality (3pts): Clean, readable, maintainable
  - Edge Cases (2pts): Handles boundary conditions`,
};

function getRubricForTopic(topic: string): string {
  const key = topic.toLowerCase();
  // Try exact match first, then partial match
  if (RUBRICS[key]) return RUBRICS[key];
  for (const [k, rubric] of Object.entries(RUBRICS)) {
    if (key.includes(k) || k.includes(key)) return rubric;
  }
  return RUBRICS.general;
}

// ─── NexusMcpClient ───────────────────────────────────────────────────────────

export class NexusMcpClient {
  /**
   * Retrieves persistent memory context from sessionStorage
   */
  async getMemoryContext(sessionId: string): Promise<string> {
    const facts = readMemory(sessionId);
    if (facts.length === 0) return "No prior context for this session.";

    const summary = facts
      .map((f) => `• ${f.fact}`)
      .join("\n");

    console.log(`[MCP Memory] Retrieved ${facts.length} facts for session ${sessionId}`);
    return `Session Memory:\n${summary}`;
  }

  /**
   * Stores a new fact into session memory
   */
  addMemory(sessionId: string, fact: string): void {
    if (!fact.trim()) return;
    const facts = readMemory(sessionId);
    facts.push({ timestamp: Date.now(), fact: fact.trim() });
    writeMemory(sessionId, facts);
    console.log(`[MCP Memory] Stored fact: "${fact.trim()}"`);
  }

  /**
   * Clears session memory (e.g. on session reset)
   */
  clearMemory(sessionId: string): void {
    sessionStorage.removeItem(memoryKey(sessionId));
  }

  /**
   * Searches the web using Gemini's Google Search grounding
   */
  async searchWeb(query: string): Promise<string> {
    if (!apiKey) return "Web search unavailable (no API key).";
    try {
      console.log(`[MCP Search] Querying: "${query}"`);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide a brief, factual summary (3-5 sentences) about: ${query}`,
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 300,
        },
      });
      const result = response.text || "No results found.";
      console.log(`[MCP Search] Got ${result.length} chars of results`);
      return result;
    } catch (e: any) {
      console.warn("[MCP Search] Failed:", e.message);
      return "";
    }
  }

  /**
   * Returns a structured, per-language scoring rubric
   */
  async getRubric(topic: string): Promise<string> {
    const rubric = getRubricForTopic(topic);
    console.log(`[MCP Rubric] Loaded rubric for topic: "${topic}"`);
    return rubric;
  }

  /**
   * Fetches candidate's real public GitHub repos via REST API
   */
  async getCandidateRepos(username: string): Promise<string[]> {
    try {
      console.log(`[MCP GitHub] Fetching repos for ${username}...`);
      const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
      if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

      const res = await fetch(
        `https://api.github.com/users/${username}/repos?sort=updated&per_page=8`,
        { headers }
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const repos: any[] = await res.json();
      const names = repos
        .filter((r) => !r.fork)
        .map((r) => r.name);
      console.log(`[MCP GitHub] Found ${names.length} repos for ${username}`);
      return names;
    } catch (e: any) {
      console.warn("[MCP GitHub] Failed:", e.message);
      return [];
    }
  }

  /**
   * Logs an evaluation result (uses localStorage for persistence)
   */
  async logEvaluation(candidateId: string, score: number, feedback: string): Promise<void> {
    try {
      const key = `eval_${candidateId}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({ score, feedback, timestamp: Date.now() });
      localStorage.setItem(key, JSON.stringify(existing));
      console.log(`[MCP Eval] Logged score ${score} for ${candidateId}`);
    } catch {
      // ignore storage errors
    }
  }
}

export const mcpClient = new NexusMcpClient();
