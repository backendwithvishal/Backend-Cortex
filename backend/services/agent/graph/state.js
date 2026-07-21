import { Annotation } from "@langchain/langgraph";

/**
 * Shared state object threaded through the entire LangGraph agent workflow.
 */
export const AgentState = Annotation.Root({
  prompt:         Annotation(),
  conversationId: Annotation(),
  userId:         Annotation(),
  agent:          Annotation(),
  response:       Annotation(),
  images:         Annotation(),
  model:          Annotation(),
  file:           Annotation(),
  artifacts:      Annotation(),
  searchResults:  Annotation(),
  codeContext:    Annotation(),
  pdfContext:     Annotation(),
});