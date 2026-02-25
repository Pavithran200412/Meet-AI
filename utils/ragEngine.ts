import { mcpClient } from "../services/mcpClient";

// Simple text chunker (splitting by paragraphs or roughly by char count)
export const chunkText = (text: string, chunkSize: number = 1000): string[] => {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/); // Split by double newlines first
  
    let currentChunk = "";
  
    for (const para of paragraphs) {
      if ((currentChunk.length + para.length) > chunkSize) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += "\n\n" + para;
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  };
  
  // Calculate Cosine Similarity between two vectors
  export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
  
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
  
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  /**
   * Retrieves relevant context using MCP tools (Filesystem, Memory, Search)
   */
  export const retrieveContext = async (query: string, sessionId: string): Promise<string> => {
    try {
        console.log(`[RAG] Retrieving context for: "${query}"`);
        
        // Parallel MCP calls for speed
        const [memory, webResults, rubric] = await Promise.all([
            mcpClient.getMemoryContext(sessionId),
            mcpClient.searchWeb(query),
            mcpClient.getRubric("general") // Default topic for now
        ]);

        const context = `
        [MCP MEMORY]: ${memory}
        [MCP WEB SEARCH]: ${webResults}
        [MCP RUBRIC]: ${rubric}
        `;
        
        return context.trim();
    } catch (error) {
        console.error("RAG Retrieval Failed:", error);
        return "";
    }
  };
