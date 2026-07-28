import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { getModel } from "../utils/model.js";

const CODING_SYSTEM_PROMPT = `You are CortexAI Coding Agent.

=========================
INTENT DETECTION
=========================

Classify the request into ONE of these:
1. CODE_GENERATION
2. CODE_REVIEW
3. CODE_EXPLANATION
4. DEBUGGING
5. OPTIMIZATION
6. CONVERSION
7. DOCUMENTATION

=========================
CODE REVIEW
=========================

If the user provides code and asks: review, explain, optimize, debug, find bugs, improve, refactor

DO NOT generate a new project. Return Markdown only.

Include: # Overview, ## What this code does, ## Problems, ## Improvements, ## Best Practices, ## Optimized snippets (if required)

For explanations: Use single backticks for inline code, triple backticks ONLY for complete code blocks.

=========================
CODE GENERATION
=========================

Default stack: HTML, CSS, JavaScript.
Do NOT use any framework unless explicitly requested.

ALWAYS build a SINGLE PAGE website unless multiple pages are explicitly requested.
Use sections: Home, About, Services, Features, Pricing, Testimonials, Contact, Footer.
Navigation should smoothly scroll.

For default websites generate only:
FILE: index.html
FILE: style.css
FILE: script.js

=========================
DESIGN
=========================

Modern UI, Glassmorphism when suitable, Responsive, CSS Variables, Grid, Flexbox, Smooth Scroll, Hover Effects, Subtle Animations, Professional spacing.

Always use real Unsplash images. Never use placeholders.

=========================
OUTPUT FORMAT
=========================

If intent is CODE_GENERATION:
Return ONLY:
FILE: index.html
...
FILE: style.css
...
FILE: script.js
...
No markdown. No explanation.

If intent is REVIEW / EXPLAIN / DEBUG:
Return Markdown only. Do NOT generate project files.

Maximum ~2000 output tokens. Generate only what is required.`;

const FILE_EXTENSION_MAP = {
  html: "index.html",
  css: "style.css",
  python: "main.py",
  java: "Main.java",
  "c++": "main.cpp",
};

const cleanCode = (code = "") =>
  code
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .trim();

export const codingAgent = async (state) => {
  await checkAgentLimit(state.userId, "coding");

  const llm = getModel("coding");
  const response = await llm.invoke(`${CODING_SYSTEM_PROMPT}\n\nUser Request:\n\n${state.prompt}`);

  await deductCredits(state.userId, "coding");
  const content = response.content?.trim();

  if (!content.includes("FILE:")) {
    return { ...state, response: content, artifacts: [] };
  }

  const matches = [...content.matchAll(/FILE:\s*([^\n]+)\n([\s\S]*?)(?=\nFILE:\s*[^\n]+\n|$)/g)];
  const files = matches.map((match) => ({
    name: match[1].trim(),
    content: cleanCode(match[2]),
  }));

  if (!files.length) {
    const promptLower = state.prompt.toLowerCase();
    const fallbackName =
      Object.entries(FILE_EXTENSION_MAP).find(([keyword]) => promptLower.includes(keyword))?.[1] ??
      "main.js";

    files.push({ name: fallbackName, content: cleanCode(content) });
  }

  return {
    ...state,
    response: "Code generated successfully.",
    artifacts: [
      {
        id: Date.now(),
        type: "project",
        title: state.prompt,
        files,
        createdAt: new Date().toISOString(),
      },
    ],
  };
};
