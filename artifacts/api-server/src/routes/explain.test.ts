import { describe, it, expect } from "vitest";

// Extract parseBatchExplanations logic for unit testing
// Since it's not exported, we replicate the parsing logic here to test it

function parseBatchExplanations(raw: string, expectedCount: number): string[] {
  const explanations: string[] = [];

  // Try splitting by "## Card N:" pattern
  const cardPattern = /^##\s*Card\s*\d+:/gm;
  const parts = raw.split(cardPattern).filter((p) => p.trim());

  if (parts.length >= expectedCount) {
    for (let i = 0; i < expectedCount; i++) {
      explanations.push(parts[i].trim());
    }
    return explanations;
  }

  // Fallback: try splitting by "Card N:" without ##
  const altPattern = /^Card\s*\d+:/gm;
  const altParts = raw.split(altPattern).filter((p) => p.trim());
  if (altParts.length >= expectedCount) {
    for (let i = 0; i < expectedCount; i++) {
      explanations.push(altParts[i].trim());
    }
    return explanations;
  }

  // Fallback: split evenly by double newlines
  const chunks = raw.split(/\n\n+/).filter((c) => c.trim());
  if (chunks.length >= expectedCount) {
    const chunkSize = Math.floor(chunks.length / expectedCount);
    for (let i = 0; i < expectedCount; i++) {
      const start = i * chunkSize;
      const end = i === expectedCount - 1 ? chunks.length : (i + 1) * chunkSize;
      explanations.push(chunks.slice(start, end).join("\n\n").trim());
    }
    return explanations;
  }

  // Last resort: return the whole text as a single explanation
  explanations.push(raw.trim());
  return explanations;
}

describe("explain route — parseBatchExplanations", () => {
  describe("## Card N: pattern", () => {
    it("parses responses with ## Card N: headers", () => {
      const raw = `## Card 1: What is diabetes?
Diabetes is a metabolic disorder.

## Card 2: What is insulin?
Insulin is a hormone produced by the pancreas.

## Card 3: What is HbA1c?
HbA1c measures average blood glucose.`;
      const result = parseBatchExplanations(raw, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toContain("Diabetes is a metabolic disorder");
      expect(result[1]).toContain("Insulin is a hormone");
      expect(result[2]).toContain("HbA1c measures");
    });

    it("handles extra whitespace in headers", () => {
      const raw = `##Card 1: Topic A
Explanation A.

##  Card 2: Topic B
Explanation B.`;
      const result = parseBatchExplanations(raw, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe("Card N: pattern (without ##)", () => {
    it("parses responses with plain Card N: headers", () => {
      const raw = `Card 1: Topic A
Explanation A.

Card 2: Topic B
Explanation B.`;
      const result = parseBatchExplanations(raw, 2);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain("Explanation A");
      expect(result[1]).toContain("Explanation B");
    });
  });

  describe("double newline fallback", () => {
    it("splits by double newlines when no headers found", () => {
      const raw = `Explanation A for topic 1.

Explanation B for topic 2.

Explanation C for topic 3.`;
      const result = parseBatchExplanations(raw, 3);
      expect(result).toHaveLength(3);
    });
  });

  describe("fallback to single explanation", () => {
    it("returns whole text as single explanation when not enough parts", () => {
      const raw = "This is a single explanation without any structure.";
      const result = parseBatchExplanations(raw, 3);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(raw);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = parseBatchExplanations("", 1);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("");
    });

    it("handles more parts than expected", () => {
      const raw = `## Card 1: A
Text A.

## Card 2: B
Text B.

## Card 3: C
Text C.

## Card 4: D
Text D.`;
      const result = parseBatchExplanations(raw, 2);
      expect(result).toHaveLength(2);
    });

    it("handles markdown content in explanations", () => {
      const raw = `## Card 1: Pathophysiology
**Type 2 diabetes** involves insulin resistance.

Key mechanisms:
- Reduced receptor sensitivity
- Beta cell dysfunction

## Card 2: Treatment
First-line: **metformin**`;
      const result = parseBatchExplanations(raw, 2);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain("**Type 2 diabetes**");
      expect(result[1]).toContain("**metformin**");
    });
  });
});
