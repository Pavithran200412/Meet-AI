import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { executeCode } from "../services/compilerService.js";
import { generateInterviewQuestion, reviewCodeWithAI } from "../services/geminiService.js";
import { Persona } from "../types.js";

// --- Tool Schemas ---

const ExecuteCodeSchema = z.object({
  language: z.string().describe("Programming language (python, typescript, java, etc.)"),
  code: z.string().describe("Source code to execute")
});

const ScoreAnswerSchema = z.object({
  language: z.string(),
  code: z.string()
});

const GenerateQuestionSchema = z.object({
  topic: z.string().describe("Technical topic (e.g., React, Algorithms)"),
  difficulty: z.enum(["easy", "medium", "hard"]).describe("Difficulty level"),
  role: z.string().describe("Candidate role (e.g., Senior Frontend Engineer)")
});

// --- Server Setup ---

const server = new Server(
  {
    name: "nexus-ai-assessment",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Tool Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_code",
        description: "Execute code in a secure sandbox environment via Piston API",
        inputSchema: {
          type: "object",
          properties: {
            language: { type: "string", description: "Programming language" },
            code: { type: "string", description: "Source code" }
          },
          required: ["language", "code"]
        }
      },
      {
        name: "score_answer",
        description: "Evaluate a candidate's code submission using AI rubrics",
        inputSchema: {
          type: "object",
          properties: {
            language: { type: "string" },
            code: { type: "string" }
          },
          required: ["language", "code"]
        }
      },
      {
        name: "generate_question",
        description: "Generate a technical interview question based on topic and difficulty",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            role: { type: "string" }
          },
          required: ["topic", "difficulty", "role"]
        }
      },
      {
        name: "get_candidate_profile",
        description: "Retrieve the current candidate's session profile and context",
        inputSchema: {
          type: "object",
          properties: {},
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "execute_code") {
      const { language, code } = ExecuteCodeSchema.parse(args);
      const result = await executeCode(language, code);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    if (name === "score_answer") {
      const { language, code } = ScoreAnswerSchema.parse(args);
      // Reusing the existing AI review logic
      const feedback = await reviewCodeWithAI(language, code);
      return {
        content: [
          {
            type: "text",
            text: feedback
          }
        ]
      };
    }

    if (name === "generate_question") {
      const { topic, difficulty, role } = GenerateQuestionSchema.parse(args);
      // Construct a prompt context for the existing service
      const prompt = `Topic: ${topic}, Difficulty: ${difficulty}, Role: ${role}`;
      // We use a generic persona here as the tool caller might define context
      const result = await generateInterviewQuestion(prompt, Persona.INTERVIEWER);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    if (name === "get_candidate_profile") {
      // In a real implementation, this would fetch from a database or session store.
      // For now, we return a mock profile structure.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: "session_mock_123",
              status: "active",
              current_score: 85,
              topics_covered: ["react", "typescript"]
            }, null, 2)
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// --- Start Server ---

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Nexus AI Assessment MCP Server running on stdio");
