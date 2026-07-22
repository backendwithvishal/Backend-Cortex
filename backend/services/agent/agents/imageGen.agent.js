import axios from "axios";
import { getModel } from "../utils/model.js";
import { storage } from "../utils/storage.js";
import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";

/**
 * Image Generation Agent: enhances user prompt and generates image via Pollinations AI.
 * Stores result in local storage adapter.
 */
export const imageAgent = async (state) => {
  try {
    await checkAgentLimit(state.userId, "image");

    const llm = getModel("image");

    const promptResponse = await llm.invoke(`
You are an elite AI image prompt engineer.
Convert the user request into a highly detailed image generation prompt.

Requirements:
- Cinematic lighting
- Professional composition
- Ultra realistic
- High detail
- Beautiful color palette
- Sharp focus
- 8K quality
- Photorealistic

Return only the image prompt.

User Request:
${state.prompt}`);

    const enhancedPrompt = promptResponse.content.trim();
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}`;

    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const imageBuffer = Buffer.from(imageResponse.data);
    const fileName = `image-${Date.now()}.png`;

    await storage.saveFile(imageBuffer, fileName, "image/png");
    const downloadUrl = await storage.getDownloadUrl(fileName);

    await deductCredits(state.userId, "image");

    return {
      ...state,
      response: `
# 🖼️ Image Generated Successfully

![Generated Image](${downloadUrl})

📥 [Download Image](${downloadUrl})
`,
    };
  } catch (error) {
    return {
      ...state,
      response: "❌ Failed to generate image: " + error.message,
    };
  }
};
