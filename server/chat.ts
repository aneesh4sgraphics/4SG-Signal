import { Router } from "express";
import { hybridRAG } from "./rag";
import { isAuthenticated } from "./replitAuth";

const chatRouter = Router();

chatRouter.post("/api/chat", isAuthenticated, async (req, res) => {
  try {
    const { question, message, conversationHistory } = req.body;
    
    // Support both 'question' and 'message' fields for compatibility
    const userQuery = question || message;
    
    if (!userQuery || typeof userQuery !== 'string') {
      return res.status(400).json({ 
        message: "Question is required",
        sources: [] 
      });
    }

    // Use hybrid RAG with automatic fallback
    const response = await hybridRAG(
      userQuery,
      conversationHistory || [],
      process.env.OPENAI_API_KEY
    );
    
    // Always return message + sources structure
    return res.json({
      message: response.message || "I couldn't process your request.",
      sources: response.sources || []
    });
    
  } catch (error: any) {
    console.error("Chat endpoint error:", error);
    
    // Try local search as ultimate fallback
    try {
      const localResponse = await hybridRAG(
        req.body.question || req.body.message,
        [],
        undefined // No API key forces local search
      );
      
      return res.json({
        message: localResponse.message,
        sources: localResponse.sources || []
      });
    } catch (fallbackError) {
      console.error("Local search also failed:", fallbackError);
    }
    
    // Final fallback response
    return res.status(500).json({
      message: "Service temporarily unavailable. Please use the Price List or Quote Calculator directly.",
      sources: []
    });
  }
});

export default chatRouter;