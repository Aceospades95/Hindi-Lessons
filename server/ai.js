"use strict";
/**
 * Optional adjudicator backed by a self-hosted, OpenAI-compatible LLM
 * (Ollama, LM Studio, vLLM, LocalAI, text-generation-webui, llama.cpp server…).
 *
 * It is only ever asked about freeform answers the rule-based grader marked
 * `wrong`, and it can only UPGRADE a verdict — never downgrade one. That keeps a
 * flaky or slow model from ever making the app harsher than the rules alone,
 * and means the app is fully functional with AI switched off.
 *
 * Configure with:
 *   AI_BASE_URL   e.g. http://192.168.1.50:11434/v1   (note the /v1)
 *   AI_MODEL      e.g. qwen2.5:7b-instruct
 *   AI_API_KEY    optional
 *   AI_TIMEOUT_MS default 9000
 */

const BASE = (process.env.AI_BASE_URL || "").replace(/\/+$/, "");
const MODEL = process.env.AI_MODEL || "";
const KEY = process.env.AI_API_KEY || "";
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS || 9000);

const enabled = () => Boolean(BASE && MODEL);

const SYSTEM = `You are a patient Hindi teacher grading one short answer from an adult beginner
learning the Delhi dialect. You are the second opinion: a strict string matcher already said
"wrong", and it is often wrong about that.

Judge MEANING and COMMUNICATIVE SUCCESS, not spelling. Say "correct" when the learner's answer
would be understood by a Hindi speaker in Delhi as conveying the expected meaning, even if:
- the wording, word order or synonym choice differs from the reference
- romanization differs (kitab/kitaab, dilli/dillee, jaroor/zaroor, wahaan/vahaan, theek/Theek)
- articles, punctuation, capitalisation, or the infinitive "to" differ
- politeness level differs but the content is right (mention it in the note)
- a gender agreement slips on an adjective or verb (mention it in the note)

Say "wrong" only when the meaning is genuinely different, missing, or reversed — for example a
different tense that changes the fact, a negation added or dropped, or a different subject.

Reply with STRICT JSON and nothing else:
{"verdict":"correct"|"partial"|"wrong","note":"<= 18 words, warm, specific, or empty"}

"partial" means the core meaning is there but something real is off (tense, gender, a missing word).
Never include markdown, backticks, or any text outside the JSON object.`;

const FEWSHOT = [
  { role: "user", content: 'Expected: "I live in Delhi."\nLearner: "I stay in Delhi"' },
  { role: "assistant", content: '{"verdict":"correct","note":"Stay works fine here."}' },
  { role: "user", content: 'Expected: "main chaay peetaa hoon."\nLearner: "mai chai pita hu"' },
  { role: "assistant", content: '{"verdict":"correct","note":"Spelling is loose but the sentence is right."}' },
  { role: "user", content: 'Expected: "She went to the market."\nLearner: "She goes to the market."' },
  { role: "assistant", content: '{"verdict":"partial","note":"Right idea, but this is past tense: went."}' },
  { role: "user", content: 'Expected: "I am hungry."\nLearner: "I am thirsty."' },
  { role: "assistant", content: '{"verdict":"wrong","note":"Thirsty is pyaas; hungry is bhookh."}' },
];

async function adjudicate({ prompt, expected, given, mode }) {
  if (!enabled()) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const messages = [
      { role: "system", content: SYSTEM },
      ...FEWSHOT,
      {
        role: "user",
        content:
          (prompt ? `Task shown to the learner: ${prompt}\n` : "") +
          `Answer type: ${mode === "en" ? "English meaning" : mode === "dev" ? "Devanagari" : "Hindi in roman letters"}\n` +
          `Expected: "${expected}"\nLearner: "${given}"`,
      },
    ];
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL, messages, temperature: 0, max_tokens: 120,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const out = JSON.parse(m[0]);
    if (!["correct", "partial", "wrong"].includes(out.verdict)) return null;
    return { verdict: out.verdict, note: String(out.note || "").slice(0, 160) };
  } catch {
    return null;            // unreachable, slow, or bad JSON -> rules stand
  } finally {
    clearTimeout(timer);
  }
}

/** Ping the configured endpoint so the settings page can show a real status. */
async function health() {
  if (!enabled()) return { enabled: false, reason: "AI_BASE_URL / AI_MODEL not set" };
  const started = Date.now();
  const r = await adjudicate({
    prompt: "", expected: "I live in Delhi.", given: "I stay in Delhi", mode: "en",
  });
  return r
    ? { enabled: true, ok: true, model: MODEL, base: BASE, ms: Date.now() - started, sample: r }
    : { enabled: true, ok: false, model: MODEL, base: BASE, ms: Date.now() - started,
        reason: "no usable reply (check URL ends in /v1, model name, and that the server is reachable)" };
}

module.exports = { adjudicate, health, enabled, MODEL, BASE };
