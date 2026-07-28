import fs from "fs";
import crypto from "crypto";
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createVectorStore } from "../utils/vectorStore.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModel } from "../utils/model.js";
import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";

export const pdfRagAgent = async (state) => {
  let collectionName = "";
  let vectorStore = null;

  try {
    await checkAgentLimit(state.userId, "pdf_rag");

    if (!state.file?.path || !fs.existsSync(state.file.path)) {
      throw new Error("PDF file is missing or unreadable.");
    }

    const buffer = fs.readFileSync(state.file.path);
    const pdf = new PDFParse({ data: buffer });
    const result = await pdf.getText();
    const text = result.text;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([text]);
    collectionName = `pdf-rag-${crypto.randomUUID()}`;

    vectorStore = await createVectorStore(collectionName, docs);
    const relevantDocs = await vectorStore.similaritySearch(state.prompt, 5);
    const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    const llm = getModel("pdf-rag");

    const messages = [
      new SystemMessage(`
You are CortexAI PDF Assistant.

Rules:
- Answer ONLY from the uploaded PDF.
- Never make up information.
- If the answer is not present in the PDF, reply: "I couldn't find this information in the uploaded PDF."
- Use Markdown formatting.
`),
      new HumanMessage(`
Context:
${context}

Question:
${state.prompt}
`),
    ];

    const response = await llm.invoke(messages);

    await deductCredits(state.userId, "pdf_rag");

    return {
      ...state,
      docs,
      response: response.content,
    };
  } catch (error) {
    console.error(`[pdfRagAgent] Error: ${error.message}`, error);
    return {
      ...state,
      response: "Something went wrong processing your PDF, please try again.",
    };
  } finally {
    if (vectorStore?.client && collectionName) {
      try {
        await vectorStore.client.deleteCollection(collectionName);
      } catch (err) {
        console.error(`[pdfRagAgent] Collection cleanup failed: ${err.message}`);
      }
    }

    if (state.file?.path && fs.existsSync(state.file.path)) {
      try {
        fs.unlinkSync(state.file.path);
      } catch (err) {
      }
    }
  }
};
