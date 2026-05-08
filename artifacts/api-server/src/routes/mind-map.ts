import { Router, type IRouter } from "express";
import { createRateLimiter } from "../lib/rate-limiter";
import { MINDMAP_MODEL } from "../lib/models";

const router: IRouter = Router();
const mindMapRateLimiter = createRateLimiter(10, 60_000);

function isDailyLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("free-models-per-day");
}

router.post("/mind-map", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!mindMapRateLimiter(ip)) {
    res.status(429).json({ error: "Too many requests. Please wait before generating again." });
    return;
  }

  const { topic, cards } = req.body as {
    topic?: string;
    cards?: Array<{ front: string; back: string }>;
  };
  if (!topic && (!cards || cards.length === 0)) {
    res.status(400).json({ error: "topic or cards are required." });
    return;
  }

  if (
    !process.env.OLLAMA_CLOUD_API_KEY &&
    !process.env.OPENROUTER_API_KEY &&
    !process.env.OPENAI_API_KEY1 &&
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    res
      .status(503)
      .json({
        error:
          "AI is not configured. Set OLLAMA_CLOUD_API_KEY for Ollama Cloud, or set OPENROUTER_API_KEY.",
      });
    return;
  }

  const { openai, getFallbackOpenAI, FALLBACK_MODEL } =
    await import("@workspace/integrations-openai-ai-server");
  const content = cards
    ? `Topic: ${topic ?? "Study material"}\n\nCards:\n${cards.map((c, i) => `${i + 1}. Q: ${c.front}\n   A: ${c.back}`).join("\n")}`
    : `Topic: ${topic}`;

  const systemPrompt = `You are a mind-map generator. Given study material, produce a mind map as JSON.

Return ONLY valid JSON in exactly this format (no markdown, no explanation):
{
  "center": "Main Topic",
  "branches": [
    {
      "label": "Branch 1",
      "color": "#6366f1",
      "children": ["subtopic 1", "subtopic 2", "subtopic 3"]
    }
  ]
}

Rules:
- center: the main topic (short, ≤5 words)
- 4–7 branches, each representing a key concept
- 2–5 children per branch (short phrases, ≤8 words each)
- colors: use varied hex colors from this palette: #6366f1, #ec4899, #f59e0b, #10b981, #3b82f6, #ef4444, #8b5cf6
- All text must be concise and educational`;

  const makeRequest = async (client: typeof openai, model: string) =>
    client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });

  try {
    let completion;
    try {
      console.log(`[mind-map] Calling model="${MINDMAP_MODEL}"`);
      completion = await makeRequest(openai, MINDMAP_MODEL);
      console.log(`[mind-map] Response received, content length=${completion.choices[0]?.message?.content?.length ?? 0}`);
    } catch (primaryErr) {
      const status = (primaryErr as { status?: number }).status;
      console.error(`[mind-map] PRIMARY model error (status=${status}):`, primaryErr instanceof Error ? primaryErr.message : primaryErr);
      const fb = isDailyLimitError(primaryErr) ? getFallbackOpenAI() : null;
      if (fb) {
        console.warn("[mind-map] AI provider limit hit — falling back to backup model");
        completion = await makeRequest(fb, FALLBACK_MODEL);
      } else {
        throw primaryErr;
      }
    }

    const rawContent = completion.choices[0]?.message?.content ?? "";
    // Strip reasoning blocks emitted by thinking models (e.g. <think>...</think>)
    const raw = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    console.log(`[mind-map] Raw response (first 200 chars): ${raw.slice(0, 200)}`);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[mind-map] No JSON object found in response");
      res.status(500).json({ error: "AI returned invalid mind map format. Please try again." });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mind map generation failed.";
    const status = (err as { status?: number }).status;
    console.error(`[mind-map] Generation failed (status=${status}):`, message);
    const friendly =
      status === 404
        ? `AI model '${MINDMAP_MODEL}' not found. Check your model name in .env.`
        : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
          ? "Cannot connect to AI provider. Check your internet connection and OLLAMA_CLOUD_BASE_URL."
          : `Mind map generation failed: ${message}`;
    res.status(503).json({ error: friendly });
  }
});

export default router;
