// const express = require('express');
// const router = express.Router();
// const Anthropic = require('@anthropic-ai/sdk');
// const { logger } = require('../utils/logger');
// const { validateAnalysisRequest } = require('../middleware/validate');
// const { buildDecisionPrompt, buildEmbeddingPrompt } = require('../services/promptBuilder');
// const { computeFingerprint, calcSimilarity, calcIntegrity } = require('../services/detection');
// const { applyDecisionRules, buildReasoning } = require('../services/decisionEngine');

// // ── POST /api/analyze ─────────────────────────────────────────────────────────
// // Body: { scenario, contentType, matches[], fileHash?, fileSize?, fileName? }
// router.post('/', validateAnalysisRequest, async (req, res) => {
//   const { scenario, contentType, matches = [], fileHash, fileSize, fileName } = req.body;

//   const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
//   if (!apiKey) {
//     return res.status(401).json({ error: 'Anthropic API key required. Pass as X-Api-Key header or set ANTHROPIC_API_KEY env var.' });
//   }

//   try {
//     const client = new Anthropic({ apiKey });

//     // ── Step 1: Compute local signals ────────────────────────────────────────
//     const fingerprint = computeFingerprint(fileName || 'demo', fileSize || 2621440, scenario);
//     const processedMatches = matches.map((m, i) => {
//       const sim = m.similarity !== undefined ? m.similarity : calcSimilarity(fingerprint, m, scenario);
//       const intResult = calcIntegrity(m.manip || scenario, i);
//       return { ...m, similarity: sim, integrity: intResult.score, signals: intResult.signals };
//     });

//     const topMatch = processedMatches[0];
//     const sim = topMatch?.similarity ?? 0.5;
//     const integrity = topMatch?.integrity ?? 0.5;

//     // ── Step 2: Claude decision reasoning ────────────────────────────────────
//     const decisionPrompt = buildDecisionPrompt({ scenario, contentType, sim, integrity, matches: processedMatches });
//     const decisionResponse = await client.messages.create({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 700,
//       messages: [{ role: 'user', content: decisionPrompt }],
//     });
//     const decisionText = decisionResponse.content.map(b => b.type === 'text' ? b.text : '').join('');
//     const decResult = parseDecisionResponse(decisionText, sim, integrity, scenario);

//     // ── Step 3: Embedding similarity interpretation ────────────────────────
//     const embPrompt = buildEmbeddingPrompt({ scenario, sim, contentType });
//     const embResponse = await client.messages.create({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 300,
//       messages: [{ role: 'user', content: embPrompt }],
//     });
//     const embText = embResponse.content.map(b => b.type === 'text' ? b.text : '').join('');
//     const embResult = { similarity_score: sim, interpretation: embText.trim() };

//     // ── Step 4: Local viral/trust computation ─────────────────────────────
//     const trustScore = sim * integrity;
//     const viralScore = computeViralScore(scenario, processedMatches.length);
//     const finalDecision = applyDecisionRules(trustScore, viralScore);
//     const reasoning = buildReasoning(sim, integrity, trustScore, viralScore, finalDecision);

//     res.json({
//       success: true,
//       decResult: {
//         decision: finalDecision,
//         trust_score: trustScore,
//         integrity_score: integrity,
//         reasoning,
//         ai_reasoning: decResult.reasoning,
//         raw: decisionText,
//       },
//       embeddingResult: embResult,
//       viralData: { score: viralScore / 100, anomalyFlag: viralScore > 75 },
//       matches: processedMatches,
//       metrics: {
//         similarity: sim,
//         integrity,
//         trust_score: trustScore,
//         viral_score: viralScore,
//         decision: finalDecision,
//       },
//     });

//   } catch (err) {
//     logger.error('Analysis failed', { message: err.message, scenario });
//     if (err.status === 401) return res.status(401).json({ error: 'Invalid Anthropic API key' });
//     if (err.status === 429) return res.status(429).json({ error: 'Anthropic rate limit hit. Please wait.' });
//     res.status(500).json({ error: 'Analysis pipeline failed', detail: err.message });
//   }
// });

// // ── POST /api/analyze/ml ─────────────────────────────────────────────────────
// // ML classifier endpoint — returns label + manipulation probability
// router.post('/ml', validateAnalysisRequest, async (req, res) => {
//   const { scenario, sim = 0.5, integrity = 0.5 } = req.body;
//   const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
//   if (!apiKey) return res.status(401).json({ error: 'API key required' });

//   try {
//     const client = new Anthropic({ apiKey });
//     const prompt = `You are a media forensics ML classifier. Given these signals, output JSON only.
// Scenario: ${scenario}
// Visual similarity to original: ${(sim * 100).toFixed(1)}%
// Integrity score: ${(integrity * 100).toFixed(1)}%

// Respond with ONLY this JSON (no prose, no markdown):
// {"label":"TAMPERED|SUSPICIOUS|SAFE","manipulation_probability":0.0,"trust_score":0.0,"confidence":0.0,"explanation":"one sentence"}`;

//     const r = await client.messages.create({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 150,
//       messages: [{ role: 'user', content: prompt }],
//     });
//     const text = r.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
//     let mlResult;
//     try { mlResult = JSON.parse(text.replace(/```json|```/g, '').trim()); }
//     catch { mlResult = { label: sim < 0.5 ? 'TAMPERED' : sim < 0.7 ? 'SUSPICIOUS' : 'SAFE', manipulation_probability: 1 - sim, trust_score: sim * integrity, confidence: 0.8, explanation: text }; }

//     res.json({ success: true, ...mlResult });
//   } catch (err) {
//     logger.error('ML classify failed', { message: err.message });
//     res.status(500).json({ error: 'ML classification failed' });
//   }
// });

// // ── POST /api/analyze/viral ──────────────────────────────────────────────────
// router.post('/viral', async (req, res) => {
//   const { scenario, matchCount = 1, platforms = [] } = req.body;
//   const score = computeViralScore(scenario, matchCount);
//   const velocity = Math.round(score * 0.8 + Math.random() * 20);
//   const acceleration = Math.round(velocity * 0.3);
//   const ppm = Math.round((matchCount + 1) * 12 + score * 0.5);
//   res.json({
//     success: true,
//     score: score / 100,
//     velocity,
//     acceleration,
//     postsPerMin: ppm,
//     anomalyFlag: score > 75,
//     anomalyScore: score / 100,
//   });
// });

// // ── Helpers ──────────────────────────────────────────────────────────────────
// function parseDecisionResponse(text, sim, integrity, scenario) {
//   const upper = text.toUpperCase();
//   let decision = 'REVIEW';
//   if (upper.includes('EMERGENCY_TAKEDOWN') || upper.includes('EMERGENCY TAKEDOWN')) decision = 'EMERGENCY_TAKEDOWN';
//   else if (upper.includes('TAKEDOWN')) decision = 'TAKEDOWN';
//   else if (upper.includes('ALLOW')) decision = 'ALLOW';
//   else if (upper.includes('REVIEW REQUIRED') || upper.includes('REVIEW')) decision = 'REVIEW';

//   const lines = text.split('\n').filter(l => l.trim().length > 10 && !l.includes('{') && !l.includes('}'));
//   const reasoning = lines.slice(0, 4).map(l => l.replace(/^[-•*\d.]\s*/, '').trim()).filter(Boolean);

//   return { decision, reasoning, trust_score: sim * integrity };
// }

// function computeViralScore(scenario, matchCount) {
//   const base = { deepfake: 72, crop: 55, manipulated: 61, news: 48, entertainment: 58, insufficient: 18, normal: 22 };
//   const s = (base[scenario] || 35) + matchCount * 4;
//   return Math.min(99, Math.max(5, s));
// }

// module.exports = router;
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { logger } = require('../utils/logger');
const { validateAnalysisRequest } = require('../middleware/validate');
const { buildDecisionPrompt, buildEmbeddingPrompt } = require('../services/promptBuilder');
const { computeFingerprint, calcSimilarity, calcIntegrity } = require('../services/detection');
const { applyDecisionRules, buildReasoning } = require('../services/decisionEngine');

// ── Gemini Setup ───────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ── POST /api/analyze ──────────────────────────────────────────
router.post('/', validateAnalysisRequest, async (req, res) => {
  const { scenario, contentType, matches = [], fileSize, fileName } = req.body;

  try {
    // ── Step 1: Compute local signals ─────────────────────────
    const fingerprint = computeFingerprint(fileName || 'demo', fileSize || 2621440, scenario);

    const processedMatches = matches.map((m, i) => {
      const sim = m.similarity !== undefined ? m.similarity : calcSimilarity(fingerprint, m, scenario);
      const intResult = calcIntegrity(m.manip || scenario, i);
      return { ...m, similarity: sim, integrity: intResult.score, signals: intResult.signals };
    });

    const topMatch = processedMatches[0];
    const sim = topMatch?.similarity ?? 0.5;
    const integrity = topMatch?.integrity ?? 0.5;

    // ── Step 2: Gemini Decision Reasoning ─────────────────────
    const decisionPrompt = buildDecisionPrompt({
  scenario,
  contentType,
  sim,
  integrity,
  matches: processedMatches
});

console.log("🔥 GEMINI CALLED");   // 👈 ADD THIS

const decisionResult = await model.generateContent(decisionPrompt);

console.log("✅ GEMINI RESPONSE RECEIVED"); // 👈 ADD THIS

const decisionText = (await decisionResult.response).text();

console.log("🧠 GEMINI OUTPUT:", decisionText); // 👈 OPTIONAL (best for proof)

    // ── Step 3: Gemini Embedding Interpretation ───────────────
    const embPrompt = buildEmbeddingPrompt({ scenario, sim, contentType });

    const embResultRaw = await model.generateContent(embPrompt);
    const embText = (await embResultRaw.response).text();

    const embResult = {
      similarity_score: sim,
      interpretation: embText.trim()
    };

    // ── Step 4: Local scoring logic (UNCHANGED) ───────────────
    const trustScore = sim * integrity;
    const viralScore = computeViralScore(scenario, processedMatches.length);
    const finalDecision = applyDecisionRules(trustScore, viralScore);
    const reasoning = buildReasoning(sim, integrity, trustScore, viralScore, finalDecision);

    res.json({
      success: true,
      decResult: {
        decision: finalDecision,
        trust_score: trustScore,
        integrity_score: integrity,
        reasoning,
        ai_reasoning: decResult.reasoning,
        raw: decisionText,
      },
      embeddingResult: embResult,
      viralData: { score: viralScore / 100, anomalyFlag: viralScore > 75 },
      matches: processedMatches,
      metrics: {
        similarity: sim,
        integrity,
        trust_score: trustScore,
        viral_score: viralScore,
        decision: finalDecision,
      },
    });

  } catch (err) {
    logger.error('Analysis failed', { message: err.message, scenario });
    res.status(500).json({
      error: 'Analysis pipeline failed',
      detail: err.message
    });
  }
});

// ── POST /api/analyze/ml ─────────────────────────────────────
router.post('/ml', validateAnalysisRequest, async (req, res) => {
  const { scenario, sim = 0.5, integrity = 0.5 } = req.body;

  try {
    const prompt = `
You are a media forensics ML classifier. Output ONLY JSON.

Scenario: ${scenario}
Visual similarity: ${(sim * 100).toFixed(1)}%
Integrity score: ${(integrity * 100).toFixed(1)}%

Return:
{"label":"TAMPERED|SUSPICIOUS|SAFE","manipulation_probability":0.0,"trust_score":0.0,"confidence":0.0,"explanation":"one sentence"}
`;

    const result = await model.generateContent(prompt);
    const text = (await result.response).text().trim();

    let mlResult;

    try {
      mlResult = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      mlResult = {
        label: sim < 0.5 ? 'TAMPERED' : sim < 0.7 ? 'SUSPICIOUS' : 'SAFE',
        manipulation_probability: 1 - sim,
        trust_score: sim * integrity,
        confidence: 0.8,
        explanation: text
      };
    }

    res.json({ success: true, ...mlResult });

  } catch (err) {
    logger.error('ML classify failed', { message: err.message });
    res.status(500).json({ error: 'ML classification failed' });
  }
});

// ── POST /api/analyze/viral ───────────────────────────────────
router.post('/viral', async (req, res) => {
  const { scenario, matchCount = 1 } = req.body;

  const score = computeViralScore(scenario, matchCount);
  const velocity = Math.round(score * 0.8 + Math.random() * 20);
  const acceleration = Math.round(velocity * 0.3);
  const ppm = Math.round((matchCount + 1) * 12 + score * 0.5);

  res.json({
    success: true,
    score: score / 100,
    velocity,
    acceleration,
    postsPerMin: ppm,
    anomalyFlag: score > 75,
    anomalyScore: score / 100,
  });
});

// ── Helpers ────────────────────────────────────────────────────
function parseDecisionResponse(text, sim, integrity) {
  const upper = text.toUpperCase();

  let decision = 'REVIEW';
  if (upper.includes('TAKEDOWN')) decision = 'TAKEDOWN';
  else if (upper.includes('ALLOW')) decision = 'ALLOW';

  const reasoning = text.split('\n')
    .filter(l => l.trim().length > 10)
    .slice(0, 4);

  return { decision, reasoning, trust_score: sim * integrity };
}

function computeViralScore(scenario, matchCount) {
  const base = {
    deepfake: 72,
    crop: 55,
    manipulated: 61,
    news: 48,
    entertainment: 58,
    insufficient: 18,
    normal: 22
  };

  const s = (base[scenario] || 35) + matchCount * 4;
  return Math.min(99, Math.max(5, s));
}

module.exports = router;