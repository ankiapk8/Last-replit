import { Router, type IRouter } from "express";
import { createRateLimiter } from "../lib/rate-limiter";
import { EXPLAIN_MODEL } from "../lib/models";

const router: IRouter = Router();

const explainRateLimiter = createRateLimiter(20, 60_000);

type ExplainMode = "full" | "revision" | "osce" | "brief" | "mnemonic" | "clinical";

async function getOpenAIClient() {
  if (
    !process.env.OPENROUTER_API_KEY &&
    !process.env.OPENAI_API_KEY1 &&
    !process.env.OPENAI_API_KEY &&
    !process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ) {
    throw new Error(
      "AI explanation is not configured. Set OPENROUTER_API_KEY (https://openrouter.ai/keys).",
    );
  }
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = await import("@workspace/integrations-openai-ai-server");
  return { openai, getFallbackOpenAI, FALLBACK_MODEL };
}

function isDailyLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("free-models-per-day");
}

function buildPrompts(
  mode: ExplainMode,
  front: string,
  back: string,
  choices?: string[],
  correctIndex?: number,
): { system: string; user: string; maxTokens: number } {
  const topic = `${front}: ${back}`;

  if (mode === "full") {
    return {
      maxTokens: 8000,
      system: `Act as a senior physician, medical professor, and clinical educator.

Your response must be:
1. Scientifically rigorous (medical-school / postgraduate level)
2. Structured and comprehensive
3. Clinically relevant

When explaining a topic derived from a flashcard, include as many of the following sections as are relevant:

1. Definition  
2. Epidemiology  
3. Etiology & Risk Factors  
4. Pathophysiology (step-by-step mechanism)  
5. Gross and microscopic pathology (if applicable)  
6. Clinical presentation (signs & symptoms)  
7. Red flags / complications  
8. Differential diagnosis (with distinguishing features)  
9. Diagnostic approach:
   - Labs
   - Imaging
   - Gold standard test
10. Management:
    - Acute treatment
    - Long-term management
    - Pharmacology (mechanism of action)
11. Prognosis  
12. High-yield exam pearls
13. Image prompts: For each diagram or illustration described, also generate a detailed AI image generation prompt suitable for DALL·E or Midjourney.

VISUALS:
- Add labeled diagrams (flowcharts, anatomical illustrations, or mechanisms)
- Use simple ASCII diagrams or describe medical illustrations clearly

STYLE:
- Use bullet points + short paragraphs
- Use **bold** for key terms
- Make it suitable for medical students and doctors

OPTIONAL (include if relevant):
- Add a brief clinical case at the end
- Compare with closely related diseases`,
      user: `Explain the topic: ${topic}`,
    };
  }

  if (mode === "revision") {
    return {
      maxTokens: 3000,
      system: `Act as a senior medical educator. Your task is to create a concise, high-yield 1-page revision sheet.

FORMAT:
- Use a clean, scannable layout
- Sections: Key Facts | Pathophysiology | Clinical Features | Investigations | Management | Pearls & Pitfalls
- Use bullet points and short phrases — no long paragraphs
- Use **bold** for the most important terms
- Include a mini mnemonic or memory aid if relevant
- The entire output should fit on one printed A4 page — be ruthlessly concise
- End with 3–5 high-yield exam bullet points labelled "⚡ EXAM PEARLS"

STYLE: Concise, structured, exam-ready.`,
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
[1–2 sentences: why this is correct — mechanism or key fact.]

❌ Why each wrong answer is incorrect:
[letter]. [choice text] — [1 sentence reason]
[letter]. [choice text] — [1 sentence reason]
... (one line per wrong option)

Be precise and clinically accurate. No preamble, no section headers, no markdown fences — just the two sections above.`,
      user: `Question: ${front}

Options:
${choiceLines}

Explanation given: ${back}`,
    };
  }

  if (mode === "mnemonic") {
    return {
      maxTokens: 1200,
      system: `You are a master medical educator specialising in memory techniques.
Create a memorable mnemonic or story for the given medical topic.

FORMAT:
1. **The Mnemonic** — a catchy acronym, rhyme, or phrase (make it vivid and weird — weird = memorable)
2. **Breakdown** — what each letter/element stands for, with a 1-sentence explanation
3. **Memory Hook** — a brief vivid story or visual scene that ties it all together
4. **Clinical link** — one sentence connecting the mnemonic back to patient care

Use **bold** for the mnemonic itself. Keep it punchy — aim for under 300 words.`,
      user: `Create a mnemonic for: ${topic}`,
    };
  }

  if (mode === "clinical") {
    return {
      maxTokens: 2500,
      system: `You are a senior clinician. Explain the real-world clinical application of this medical concept in a way that bridges textbook knowledge to bedside practice.

COVER:
1. **When you see this** — typical patient presentation; red flags that make you think of it
2. **What you actually do** — step-by-step clinical decision-making and investigations
3. **Pitfalls & near-misses** — common mistakes and how to avoid them
4. **Guideline snapshot** — key current guidance (mention the source if known)
5. **Clinical vignette** — a brief realistic case (3–4 sentences)

Use **bold** for key clinical action points. Be practical, not theoretical. Aim for 350–500 words.`,
      user: `Clinical correlation for: ${topic}`,
    };
  }

  // osce
  return {
    maxTokens: 8000,
    system: `Act as a senior OSCE examiner and clinical educator. Generate realistic OSCE (Objective Structured Clinical Examination) questions.

For each station include:
- **Station type** (e.g., History Taking, Physical Examination, Data Interpretation, Communication, Practical Skill)
- **Scenario / stem** — realistic patient vignette (name, age, presenting complaint, context)
- **Candidate instructions** (what the student must do in the station)
- **Examiner mark scheme** — 8–12 bullet points of expected actions/answers
- **Common mistakes** candidates make
- **Key clinical teaching point**

Generate 3–5 varied OSCE stations covering different aspects of the topic.

STYLE:
- Realistic and clinically accurate
- Appropriate for final-year medical students or junior doctors
- Use **bold** for station type and key terms`,
    user: `Create OSCE stations for the topic: ${topic}`,
  };
}

router.post("/explain", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!explainRateLimiter(ip)) {
    res.status(429).json({ error: "Too many requests. Please wait a moment before trying again." });
    return;
  }
  const { front, back, mode = "full", choices, correctIndex } = req.body as {
    front?: string; back?: string; mode?: ExplainMode;
    choices?: string[]; correctIndex?: number;
  };

  if (!front || !back) {
    res.status(400).json({ error: "front and back are required." });
    return;
  }

  const validModes: ExplainMode[] = ["full", "revision", "osce", "brief", "mnemonic", "clinical"];
  const resolvedMode: ExplainMode = validModes.includes(mode as ExplainMode) ? (mode as ExplainMode) : "full";

  const { system: systemPrompt, user: userPrompt, maxTokens } = buildPrompts(resolvedMode, front, back, choices, correctIndex);

  let clients;
  try {
    clients = await getOpenAIClient();
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "AI not configured." });
    return;
  }
  const { openai, getFallbackOpenAI, FALLBACK_MODEL } = clients;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as { flushHeaders: () => void }).flushHeaders();
  }

  const streamPayload = {
    model: EXPLAIN_MODEL,
    max_completion_tokens: maxTokens,
    stream: true as const,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ],
  };

  try {
    let stream;
    try {
      stream = await openai.chat.completions.create(streamPayload);
    } catch (primaryErr) {
      const fb = isDailyLimitError(primaryErr) ? getFallbackOpenAI() : null;
      if (fb) {
        req.log.warn({ err: primaryErr }, "OpenRouter daily limit hit — falling back to gpt-4o-mini for explanation");
        stream = await fb.chat.completions.create({ ...streamPayload, model: FALLBACK_MODEL });
      } else {
        throw primaryErr;
      }
    }

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) res.write(text);
    }
    res.end();
  } catch (err) {
    req.log.error({ err }, "AI explanation failed");
    const message = err instanceof Error ? err.message : "AI explanation failed.";
    const status = (err as { status?: number }).status;
    const friendly =
      status === 404
        ? `AI model '${EXPLAIN_MODEL}' is not available on OpenRouter. Set AI_TEXT_MODEL to a valid model or leave it unset to use the default.`
        : isDailyLimitError(err)
          ? "OpenRouter free daily limit reached. Generation automatically retried via backup AI. Please try again."
          : /quota|rate.?limit|insufficient|payment|billing/i.test(message)
            ? "AI provider quota exceeded. Add credits at openrouter.ai/credits."
            : /context length|maximum context|too many tokens/i.test(message)
              ? "The explanation request was too long for this model. Try a shorter card."
              : `AI explanation failed: ${message}`;
    if (!res.headersSent) {
      res.status(503).json({ error: friendly });
    } else {
      res.write(`\n\n[Error] ${friendly}\n`);
      res.end();
    }
  }
});

export default router;
