import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { getSearchTool } from "../utils/tavily.js";

export const searchAgent = async (state) => {
  await checkAgentLimit(state.userId, "search");

  try {
    const searchTool = getSearchTool();
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
