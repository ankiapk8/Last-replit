import OpenAI from "openai";
import { Buffer } from "node:buffer";
export declare const openai: OpenAI;
/**
 * Generate an image and return as Buffer.
 * Uses gpt-image-1 model via AI provider.
 */
export declare function generateImageBuffer(prompt: string, size?: "1024x1024" | "512x512" | "256x256"): Promise<Buffer>;
/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via AI provider.
 */
export declare function editImages(imageFiles: string[], prompt: string, outputPath?: string): Promise<Buffer>;
//# sourceMappingURL=client.d.ts.map