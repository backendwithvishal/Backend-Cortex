import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenRouter } from "@langchain/openrouter";

dotenv.config();

const gemini = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GOOGLE_API_KEY || "dummy-key",
});

const groq = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
  apiKey: process.env.GROQ_API_KEY || "dummy-key",
});

const openRouter = new ChatOpenRouter({
  model: "deepseek/deepseek-chat",
  temperature: 0,
  maxTokens: 2500,
  apiKey: process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || "dummy-key",
});

export const getModel = (agent) => {
  switch (agent) {
    case "coding":
      return openRouter;
    case "image":
      return groq;
    case "search":
      return groq;
    case "vision":
      return gemini;
    default:
      return groq;
  }
};

export { gemini, groq, openRouter };
