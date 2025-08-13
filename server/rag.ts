import fs from "fs";
import path from "path";
import OpenAI from "openai";

type Chunk = { 
  id: string; 
  file: string; 
  pageHint?: number; 
  text: string;
};

let chunks: Chunk[] = [];
let bm25: any = null;
let isIndexLoaded = false;

// Load the search index
async function loadIndex() {
  if (isIndexLoaded) return true;
  
  try {
    const chunksPath = path.join(process.cwd(), "data/index/chunks.json");
    const bm25Path = path.join(process.cwd(), "data/index/bm25.json");
    
    if (!fs.existsSync(chunksPath) || !fs.existsSync(bm25Path)) {
      console.log("Search index not found. Please run: npx ts-node scripts/ingest.ts");
      return false;
    }
    
    chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
    const bm25Json = JSON.parse(fs.readFileSync(bm25Path, "utf-8"));
    
    // Dynamic import for ES modules
    const { default: bm25Lib } = await import("wink-bm25-text-search");
    const winkUtils = await import("wink-nlp-utils");
    
    bm25 = bm25Lib();
    bm25.defineConfig({ fldWeights: { text: 1 } });
    bm25.definePrepTasks([
      winkUtils.default.string.lowerCase,
      winkUtils.default.string.removePunctuations,
      winkUtils.default.string.tokenize0,
      winkUtils.default.tokens.stem,
      winkUtils.default.tokens.removeWords
    ]);
    bm25.importJSON(bm25Json);
    
    isIndexLoaded = true;
    console.log(`Loaded search index with ${chunks.length} chunks`);
    return true;
  } catch (error) {
    console.error("Error loading search index:", error);
    return false;
  }
}

export async function localSearch(query: string, k = 5): Promise<(Chunk & { score: number })[]> {
  // Simple fallback search when BM25 fails
  const simpleSearch = () => {
    if (!chunks || chunks.length === 0) {
      // Try loading chunks directly
      try {
        const chunksPath = path.join(process.cwd(), "data/index/chunks.json");
        if (fs.existsSync(chunksPath)) {
          chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
        }
      } catch (e) {
        console.error("Failed to load chunks:", e);
        return [];
      }
    }
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    // Score each chunk based on word matches
    const scored = chunks.map(chunk => {
      const textLower = chunk.text.toLowerCase();
      let score = 0;
      
      queryWords.forEach(word => {
        const matches = (textLower.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      });
      
      return { ...chunk, score };
    });
    
    // Sort by score and return top k
    return scored
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  };
  
  if (!(await loadIndex())) {
    // If index loading fails, use simple search
    return simpleSearch();
  }
  
  try {
    const hits = bm25.search(query).slice(0, k);
    const byId = new Map(chunks.map(c => [c.id, c]));
    
    return hits.map((h: any) => {
      const c = byId.get(h[0]);
      return c ? { ...c, score: h[1] } : null;
    }).filter(Boolean) as (Chunk & { score: number })[];
  } catch (error) {
    console.error("BM25 search failed, using simple search:", error.message);
    return simpleSearch();
  }
}

// Build a local answer without OpenAI
export async function buildLocalAnswer(query: string) {
  const top = await localSearch(query, 5);
  
  if (!top.length) {
    return {
      message: "I couldn't find any matching information in our troubleshooting documents. Please try rephrasing your question or check the Price List and Quote Calculator for product information.",
      sources: []
    };
  }

  // Compose a helpful response with excerpts
  const bullets = top.map((t, i) => {
    const excerpt = t.text.slice(0, 450).replace(/\s+/g, " ").trim();
    return `${i + 1}. **${t.file}** (page ${t.pageHint ?? "?"})\n   "${excerpt}..."`;
  }).join("\n\n");

  const message = `Based on our troubleshooting documentation:\n\n${bullets}\n\n*Note: This is a local search result. For more detailed answers, ensure OpenAI API credits are available.*`;

  const sources = top.map(t => ({ 
    file: t.file, 
    page: t.pageHint ?? null,
    score: t.score 
  }));
  
  return { message, sources };
}

// Try OpenAI first, fallback to local search
export async function hybridRAG(
  query: string, 
  conversationHistory: any[] = [],
  openaiApiKey?: string
): Promise<{ message: string; sources: any[] }> {
  
  // Always do local search first to get context
  const searchResults = await localSearch(query, 5);
  const hasLocalResults = searchResults.length > 0;
  
  // Build context from search results
  let contextData = "";
  if (hasLocalResults) {
    contextData = "\n\nRelevant Documentation:\n";
    searchResults.forEach((result, i) => {
      contextData += `\n${i + 1}. From "${result.file}" (page ${result.pageHint ?? "?"}):`;
      contextData += `\n   ${result.text.slice(0, 500).replace(/\s+/g, " ")}...\n`;
    });
  }
  
  // Try OpenAI if we have an API key
  if (openaiApiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      
      const systemMessage = `You are a helpful assistant for 4S Graphics. Answer based on the provided context.
      
${contextData}

Rules:
1. Answer ONLY from the provided context
2. If no answer in context, say "I don't have that information in our documentation"
3. Be concise and reference sources`;

      const userPrompt = `Question: ${query}`;
      
      const messages = [
        { role: "system" as const, content: systemMessage },
        ...(conversationHistory || []).slice(-4).map((msg: any) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        { role: "user" as const, content: userPrompt }
      ];
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 500,
        temperature: 0.2,
      });
      
      const answer = response.choices[0].message.content || "Unable to generate response.";
      
      return {
        message: answer,
        sources: searchResults.slice(0, 3).map(r => ({
          file: r.file,
          page: r.pageHint || null
        }))
      };
      
    } catch (error: any) {
      console.log(`OpenAI unavailable (${error.code || 'error'}), using local search`);
      // Fall through to local answer
    }
  }
  
  // Fallback to local answer
  return await buildLocalAnswer(query);
}

// Check if troubleshooting PDFs are available
export function hasTroubleshootingDocs(): boolean {
  return loadIndex() && chunks.length > 0;
}