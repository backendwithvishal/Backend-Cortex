import { TavilySearch } from "@langchain/tavily";

export const getSearchTool = () => {
  const apiKey = process.env.TAVILY_API_KEY || "tvly-dummy-test-key";
  return new TavilySearch({
    maxResults: 5,
    topic: "general",
    includeImages: true,
    apiKey,
  });
};

