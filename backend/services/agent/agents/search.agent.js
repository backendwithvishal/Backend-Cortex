import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { searchTool } from "../utils/tavily.js";

/**
 * Search Agent: performs web search using Tavily and attaches results to graph state.
 */
export const searchAgent = async (state) => {
  await checkAgentLimit(state.userId, "search");

  try {
    const results = await searchTool.invoke({ query: state.prompt });
    await deductCredits(state.userId, "search");
    return {
      ...state,
      searchResults: results,
    };
  } catch (error) {
    return {
      ...state,
      searchResults: [],
    };
  }
};
