import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

/**
 * Provider priority (matches client.ts):
 *  1. GROQ_API_KEY               → Groq (primary — https://api.groq.com/openai/v1)
 *  2. OPENROUTER_API_KEY         → OpenRouter (fallback)
 *  3. OLLAMA_CLOUD_API_KEY       → Ollama Cloud (fallback)
 *  4. OPENAI_API_KEY / OPENAI_API_KEY1 → OpenAI
 *  5. AI_INTEGRATIONS_OPENAI_API_KEY → Replit injected key
 */
const groqKey = process.env.GROQ_API_KEY?.trim() || null;
const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;
const ollamaCloudKey = process.env.OLLAMA_CLOUD_API_KEY?.trim() || null;

const apiKey = groqKey
  ? groqKey
  : openRouterKey
    ? openRouterKey
    : ollamaCloudKey
      ? ollamaCloudKey
      : (process.env.OPENAI_API_KEY1 ??
        process.env.OPENAI_API_KEY ??
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

if (!apiKey) {
  throw new Error(
    "No AI provider configured. Set GROQ_API_KEY for Groq, or set OPENROUTER_API_KEY / OLLAMA_CLOUD_API_KEY."
  );
}

const baseURL = groqKey
  ? process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
  : openRouterKey
    ? process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
    : ollamaCloudKey
      ? process.env.OLLAMA_CLOUD_BASE_URL || "https://cloud.ollama.com/v1"
      : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.groq.com/openai/v1");

const defaultHeaders = openRouterKey
  ? {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://anki-generator.local",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "Anki Card Generator",
    }
  : undefined;

export const openai = new OpenAI({
  apiKey,
  baseURL,
  ...(defaultHeaders ? { defaultHeaders } : {}),
});

/**
 * Generate an image and return as Buffer.
 * Uses gpt-image-1 model via AI provider.
 */
export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via AI provider.
 */
export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
