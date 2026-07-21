import { getModel } from "../utils/model.js";

const VALID_AGENTS = new Set(["chat", "search", "coding", "pdf", "ppt", "image", "vision", "pdf_rag"]);

/**
 * Router node: determines which agent to dispatch to.
 *
 * Priority order:
 *   1. Explicit agent requested by the client → use it directly.
 *   2. File attached as an image → dispatch to vision agent.
 *   3. File attached as a PDF → dispatch to pdf_rag agent.
 *   4. Auto-route via LLM based on the user's prompt.
 */
export const routerNode = async (state) => {
  // Honour explicit agent selection from the client
  if (state.agent && state.agent !== "auto" && VALID_AGENTS.has(state.agent)) {
    return { ...state };
  }

  // File-based routing
  if (state.file) {
    if (state.file.mimetype.startsWith("image/")) {
      return { ...state, agent: "vision" };
    }
    if (state.file.mimetype === "application/pdf") {
      return { ...state, agent: "pdf_rag" };
    }
  }

  // LLM-based auto-routing
  const llm = getModel("router");

  const routerPrompt = `You are an agent router. Given the user query below, choose the single best agent.

Available agents:
- chat    — general conversation, explanations, questions
- search  — current events, news, live data, recent information
- coding  — code generation, debugging, architecture, API design
- pdf     — generate PDF documents
- ppt     — generate PowerPoint presentations
- image   — generate images

Respond with ONLY one word (the agent name).

User Query: ${state.prompt}`;

  const result = await llm.invoke(routerPrompt);
  const selected = result.content.trim().toLowerCase();

  return { ...state, agent: VALID_AGENTS.has(selected) ? selected : "chat" };
};