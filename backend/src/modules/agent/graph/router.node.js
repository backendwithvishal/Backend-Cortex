import { getModel } from "../utils/model.js";

const VALID_AGENTS = new Set([
  "chat",
  "search",
  "coding",
  "image",
  "vision",
  "pdf_rag",
]);

export const routerNode = async (state) => {
  if (state.agent && state.agent !== "auto" && VALID_AGENTS.has(state.agent)) {
    return { ...state };
  }

  if (state.file) {
    if (state.file.mimetype.startsWith("image/")) {
      return { ...state, agent: "vision" };
    }
    if (state.file.mimetype === "application/pdf") {
      return { ...state, agent: "pdf_rag" };
    }
  }

  const llm = getModel("router");

  const routerPrompt = `You are an agent router. Given the user query below, choose the single best agent.

Available agents:
- chat    — general conversation, explanations, questions
- search  — current events, news, live data, recent information
- coding  — code generation, debugging, architecture, API design
- image   — generate images

Respond with ONLY one word (the agent name).

User Query: ${state.prompt}`;

  try {
    const result = await llm.invoke(routerPrompt);
    const selected = result.content.trim().toLowerCase();
    return { ...state, agent: VALID_AGENTS.has(selected) ? selected : "chat" };
  } catch (err) {
    return { ...state, agent: "chat" };
  }
};
