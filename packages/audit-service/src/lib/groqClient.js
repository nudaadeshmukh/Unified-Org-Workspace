const OpenAI = require('openai');

// Groq exposes an OpenAI-compatible chat-completions API — this is the
// "OpenAI-compatible client" the master spec/CLAUDE.md ask for, just
// pointed at Groq's base URL instead of OpenAI's. GROQ_MODEL is env-driven
// (see .env.example — the default was updated at Phase 5 build time after
// confirming llama-3.3-70b-versatile was deprecated by Groq on 2026-06-17;
// openai/gpt-oss-120b is Groq's own migration recommendation).
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

/**
 * @param {string} promptText — must already be built from pre-scoped facts
 * only (see digest.service.js's buildDigestPrompt) — this function does not
 * re-check that; it just sends whatever string it's given.
 * @returns {Promise<string>} the model's response text, trimmed.
 */
async function generateDigest(promptText) {
  const completion = await client.chat.completions.create({
    model: process.env.GROQ_MODEL,
    messages: [{ role: 'user', content: promptText }],
    max_tokens: 150,
    temperature: 0.5,
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned no completion text');
  }
  return text.trim();
}

module.exports = { generateDigest };
