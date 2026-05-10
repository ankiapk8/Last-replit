import { Router, type IRouter } from "express";
import { createRateLimiter } from "../lib/rate-limiter";
import { EXPLAIN_MODEL } from "../lib/models";
import { generationCache, ResponseCache } from "../lib/response-cache";
import { completeChat, streamChat, shouldFallback } from "../lib/ai-client";

const router: IRouter = Router();
const explainRateLimiter = createRateLimiter(20, 60_000);

type ExplainMode = "full" | "revision" | "osce" | "brief" | "mnemonic" | "clinical";

function buildPrompts(mode: ExplainMode, front: string, back: string, choices?: string[], correctIndex?: number): { system: string; user: string; maxTokens: number } {
  const topic = `${front}: ${back}`;
  if (mode === "full") {
    return {
      maxTokens: 8000,
      system: `Act as a senior physician, medical professor, and clinical educator. Your response must be scientifically rigorous, structured, and clinically relevant. Include as many of these sections as relevant: Definition, Epidemiology, Etiology & Risk Factors, Pathophysiology, Pathology, Clinical presentation, Red flags, Differential diagnosis, Diagnostic approach, Management, Prognosis, High-yield exam pearls. Add labeled diagrams where possible. Use bullet points, **bold** for key terms. Include a brief clinical case if relevant.`,
      user: `Explain the topic: ${topic}`,
    };
  }
  if (mode === "revision") {
    return {
      maxTokens: 3000,
      system: `Act as a senior medical educator. Create a concise, high-yield 1-page revision sheet. Use sections: Key Facts | Pathophysiology | Clinical Features | Investigations | Management | Pearls & Pitfalls. Use bullet points, **bold** for important terms. End with 3-5 "⚡ EXAM PEARLS". Be ruthlessly concise.`,
      user: `Create a 1-page revision sheet for: ${topic}`,
    };
  }
  if (mode === "brief") {
    const letters = ["A", "B", "C", "D", "E", "F"];
    const choiceLines = Array.isArray(choices) && choices.length > 0
      ? choices.map((c, i) => `  ${letters[i] ?? i}. ${c}${i === correctIndex ? " ✓ CORRECT" : ""}`).join("\n")
      : "(no choices provided)";
    return {
      maxTokens: 1500,
      system: `You are a concise MCQ tutor. For the multiple-choice question given, produce a brief answer breakdown in this exact format:

✅ Correct answer: [letter]. [choice text]
[1-2 sentences: why this is correct]

❌ Why each wrong answer is incorrect:
[letter]. [choice text] - [1 sentence reason]
(one line per wrong option)

Be precise and clinically accurate. No preamble, no section headers.`,
      user: `Question: ${front}\n\nOptions:\n${choiceLines}\n\nExplanation given: ${back}`,
    };
  }
  if (mode === "mnemonic") {
    return {
      maxTokens: 1200,
      system: `You are a master medical educator specialising in memory techniques. Create a memorable mnemonic or story. FORMAT: 1. The Mnemonic (catchy acronym/rhyme) 2. Breakdown (what each letter means) 3. Memory Hook (vivid story) 4. Clinical link. Use **bold** for the mnemonic. Keep under 300 words.`,
      user: `Create a mnemonic for: ${topic}`,
    };
  }
  if (mode === "clinical") {
    return {
      maxTokens: 2500,
      system: `You are a senior clinician. Explain the real-world clinical application. COVER: 1. When you see this 2. What you actually do 3. Pitfalls & near-misses 4. Guideline snapshot 5. Clinical vignette. Use **bold** for key action points. Be practical, not theoretical. Aim for 350-500 words.`,
      user: `Clinical correlation for: ${topic}`,
    };
  }
  // osce
  return {
    maxTokens: 8000,
    system: `Act as a senior OSCE examiner and clinical educator. Generate realistic OSCE questions. For each station include: Station type, Scenario/stem, Candidate instructions, Examiner mark scheme (8-12 bullets), Common mistakes, Key clinical teaching point. Generate 3-5 varied OSCE stations. Use **bold** for station type and key terms.`,
    user: `Create OSCE stations for the topic: ${topic}`,
  };
}

router.post("/explain", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!explainRateLimiter(ip)) { res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }); return; }

  const { front, back, mode = "full", choices, correctIndex } = req.body as {
    front?: string; back?: string; mode?: ExplainMode; choices?: string[]; correctIndex?: number;
  };
  if (!front || !back) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "front and back are required." } }); return; }

  const validModes: ExplainMode[] = ["full", "revision", "osce", "brief", "mnemonic", "clinical"];
  const resolvedMode: ExplainMode = validModes.includes(mode as ExplainMode) ? (mode as ExplainMode) : "full";
  const { system: systemPrompt, user: userPrompt, maxTokens } = buildPrompts(resolvedMode, front, back, choices, correctIndex);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as { flushHeaders: () => void }).flushHeaders();
  }

  try {
    for await (const chunk of streamChat({ model: EXPLAIN_MODEL, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], maxTokens, temperature: 0.3 })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI explanation failed.";
    const status = (err as { status?: number }).status;
    const friendly = status === 404 ? `AI model '${EXPLAIN_MODEL}' not found.` : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message) ? "Cannot connect to AI provider." : `AI explanation failed: ${message}`;
    if (!res.headersSent) {
      res.status(503).json({ error: { code: "AI_ERROR", message: friendly } });
    } else {
      res.write(`\n\n[Error] ${friendly}\n`);
      res.end();
    }
  }
});

router.post("/explain/batch", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!explainRateLimiter(ip)) { res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }); return; }

  const { cards, mode = "brief" } = req.body as { cards?: Array<{ front: string; back: string }>; mode?: ExplainMode };
  if (!Array.isArray(cards) || cards.length === 0) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "cards must be a non-empty array." } }); return; }

  const MAX_BATCH = 20;
  const batch = cards.slice(0, MAX_BATCH);
  const validModes: ExplainMode[] = ["full", "revision", "osce", "brief", "mnemonic", "clinical"];
  const resolvedMode: ExplainMode = validModes.includes(mode as ExplainMode) ? (mode as ExplainMode) : "brief";
  const cardsList = batch.map((c, i) => `Card ${i + 1}:\nQ: ${c.front}\nA: ${c.back}`).join("\n\n");

  const system = `You are a concise medical educator. Below are ${batch.length} flashcards. For each card, provide a brief explanation in this exact format:

## Card 1: [Question]
[2-3 sentence explanation]

## Card 2: [Question]
[2-3 sentence explanation]

... for all ${batch.length} cards. Keep each to 2-3 sentences. Use **bold** for key terms.`;

  const user = `Provide brief explanations for these ${batch.length} flashcards:\n\n${cardsList}`;
  const cacheKey = ResponseCache.hash(`batch-explain:${EXPLAIN_MODEL}:${system}:${user}`);
  const cached = generationCache.get(cacheKey);

  if (cached) {
    const explanations = parseBatchExplanations(cached, batch.length);
    res.json({ explanations });
    return;
  }

  try {
    const result = await completeChat({ model: EXPLAIN_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], maxTokens: Math.min(8000, batch.length * 400), temperature: 0.3 });
    const stripped = result.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    generationCache.set(cacheKey, stripped);
    const explanations = parseBatchExplanations(stripped, batch.length);
    res.json({ explanations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch explanation failed.";
    res.status(503).json({ error: { code: "AI_ERROR", message: `Batch explanation failed: ${message}` } });
  }
});

function parseBatchExplanations(raw: string, expectedCount: number): string[] {
  const explanations: string[] = [];
  const cardPattern = /^##\s*Card\s*\d+:/gm;
  const parts = raw.split(cardPattern).filter((p) => p.trim());
  if (parts.length >= expectedCount) { for (let i = 0; i < expectedCount; i++) explanations.push(parts[i].trim()); return explanations; }
  const altPattern = /^Card\s*\d+:/gm;
  const altParts = raw.split(altPattern).filter((p) => p.trim());
  if (altParts.length >= expectedCount) { for (let i = 0; i < expectedCount; i++) explanations.push(altParts[i].trim()); return explanations; }
  const chunks = raw.split(/\n\n+/).filter((c) => c.trim());
  if (chunks.length >= expectedCount) { const chunkSize = Math.floor(chunks.length / expectedCount); for (let i = 0; i < expectedCount; i++) { const start = i * chunkSize; const end = i === expectedCount - 1 ? chunks.length : (i + 1) * chunkSize; explanations.push(chunks.slice(start, end).join("\n\n").trim()); } return explanations; }
  explanations.push(raw.trim());
  return explanations;
}

export default router;
