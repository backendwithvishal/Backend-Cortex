import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { routerNode } from "./router.node.js";
import { chatAgent } from "../agents/chat.agent.js";
import { codingAgent } from "../agents/coding.agent.js";
import { searchAgent } from "../agents/search.agent.js";
import { pdfAgent } from "../agents/pdf.agent.js";
import { pptAgent } from "../agents/ppt.agent.js";
import { imageAgent } from "../agents/imageGen.agent.js";
import { visionAgent } from "../agents/vision.agent.js";
import { pdfRagAgent } from "../agents/pdfRag.agent.js";

const AGENT_NODES = {
  chat: chatAgent,
  coding: codingAgent,
  search: searchAgent,
  pdf: pdfAgent,
  ppt: pptAgent,
  image: imageAgent,
  vision: visionAgent,
  pdf_rag: pdfRagAgent,
};

const workflow = new StateGraph(AgentState);

// Register all nodes
workflow.addNode("router", routerNode);
Object.entries(AGENT_NODES).forEach(([name, fn]) => workflow.addNode(name, fn));

// Router dispatches to correct agent node
workflow.addEdge("__start__", "router");
workflow.addConditionalEdges(
  "router",
  (state) => (AGENT_NODES[state.agent] ? state.agent : "chat"),
  Object.fromEntries(Object.keys(AGENT_NODES).map((k) => [k, k]))
);

// All agent nodes terminate the graph
Object.keys(AGENT_NODES).forEach((name) => workflow.addEdge(name, "__end__"));

// Exception: search feeds into chat for synthesis
workflow.addEdge("search", "chat");

export const graph = workflow.compile();
