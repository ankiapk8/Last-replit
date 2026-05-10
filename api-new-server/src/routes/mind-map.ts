import { Router, type IRouter } from "express";
import { createRateLimiter } from "../lib/rate-limiter";
import { MINDMAP_MODEL } from "../lib/models";
import { completeChat, shouldFallback } from "../lib/ai-client";

const router: IRouter = Router();
const mindMapRateLimiter = createRateLimiter(10, 60_000);

router.post("/mind-map", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!mindMapRateLimiter(ip)) {
    res
      .status(429)
      .json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait before generating again.",
        },
      });
    return;
  }

  const { topic, cards } = req.body as {
    topic?: string;
    cards?: Array<{ front: string; back: string }>;
  };
  if (!topic && (!cards || cards.length === 0)) {
    res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "topic or cards are required." } });
    return;
  }

  if (
    !process.env.OPENROUTER_API_KEY &&
    !process.env.OLLAMA_CLOUD_API_KEY &&
    !process.env.OPENAI_API_KEY1 &&
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    res
      .status(503)
      .json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "AI is not configured. Set OPENROUTER_API_KEY or OLLAMA_CLOUD_API_KEY.",
        },
      });
    return;
  }

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

  try {
    const result = await completeChat({
      model: MINDMAP_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      maxTokens: 1200,
      temperature: 0.4,
    });
    const raw = result.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res
        .status(500)
        .json({
          error: {
            code: "AI_ERROR",
            message: "AI returned invalid mind map format. Please try again.",
          },
        });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mind map generation failed.";
    const status = (err as { status?: number }).status;
    const friendly =
      status === 404
        ? `AI model '${MINDMAP_MODEL}' not found. Check your model name in .env.`
        : /ECONNREFUSED|connect|connection|network|fetch failed/i.test(message)
          ? "Cannot connect to AI provider. Check your internet connection and OPENROUTER_BASE_URL."
          : `Mind map generation failed: ${message}`;
    res.status(503).json({ error: { code: "AI_ERROR", message: friendly } });
  }
});

export default router;
