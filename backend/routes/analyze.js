const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { logger } = require('../utils/logger');
const { validateAnalysisRequest } = require('../middleware/validate');
const { buildDecisionPrompt, buildEmbeddingPrompt } = require('../services/promptBuilder');
const { computeFingerprint, calcSimilarity, calcIntegrity } = require('../services/detection');
const { applyDecisionRules, buildReasoning } = require('../services/decisionEngine');

// ── Gemini Setup ───────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY missing - using fallback mode");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({
//   model: "gemini-1.5-flash-002"
// });
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash"
});

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
//     const decisionPrompt = buildDecisionPrompt({
//       scenario,
//       contentType,
//       sim,
//       integrity,
//       matches: processedMatches
//     });

//     let decisionText = "AI analysis unavailable";

// try {
//   console.log("🔥 GEMINI CALLED");
//   console.log("Prompt:", decisionPrompt);

//   const result = await model.generateContent({
//     contents: [
//       {
//         role: "user",
//         parts: [{ text: decisionPrompt }]
//       }
//     ]
//   });

//   const response = result.response;

//   if (response && response.candidates && response.candidates.length > 0) {
//     decisionText = response.candidates[0].content.parts[0].text;
//   } else {
//     console.warn("⚠ No Gemini candidates returned");
//   }

//   console.log("✅ GEMINI RESPONSE RECEIVED");
//   console.log("🧠 OUTPUT:", decisionText);

// } catch (error) {
//   console.error("❌ GEMINI ERROR:", error.message);
// }

//     const decisionTextUpper = decisionText.toUpperCase();
//     let decision = 'REVIEW';
//     if (decisionTextUpper.includes('EMERGENCY_TAKEDOWN') || decisionTextUpper.includes('EMERGENCY TAKEDOWN')) decision = 'EMERGENCY_TAKEDOWN';
//     else if (decisionTextUpper.includes('TAKEDOWN')) decision = 'TAKEDOWN';
//     else if (decisionTextUpper.includes('ALLOW')) decision = 'ALLOW';
//     else if (decisionTextUpper.includes('REVIEW REQUIRED') || decisionTextUpper.includes('REVIEW')) decision = 'REVIEW';

//     const lines = decisionText.split('\n').filter(l => l.trim().length > 10 && !l.includes('{') && !l.includes('}'));
//     const aiReasoning = lines.slice(0, 4).map(l => l.replace(/^[-\d.]\s*/, '').trim()).filter(Boolean);

//     const decResult = { decision, reasoning: aiReasoning, trust_score: sim * integrity };

//     // ── Step 3: Gemini Embedding Interpretation ───────────────
//     const embPrompt = buildEmbeddingPrompt({ scenario, sim, contentType });

//     let embText = "Embedding analysis unavailable";
//     try {
//       console.log("GEMINI EMBEDDING CALLED");
//       const embResultRaw = await model.generateContent(embPrompt);
//       embText = (await embResultRaw.response).text();
//       console.log("GEMINI EMBEDDING RECEIVED");
//     } catch (error) {
//       console.error("GEMINI EMBEDDING ERROR:", error.message);
//       embText = "Embedding analysis unavailable - using fallback";
//     }

//     const embResult = {
//       similarity_score: sim,
//       interpretation: embText.trim()
//     };
// ── Step 2: Single Gemini call (combined decision + embedding) ─
const decisionPrompt = buildDecisionPrompt({
  scenario, contentType, sim, integrity, matches: processedMatches
});

const embPrompt = buildEmbeddingPrompt({ scenario, sim, contentType });

const combinedPrompt = `${decisionPrompt}

---

Also answer this second question:
${embPrompt}`;

let decisionText = "AI analysis unavailable";
let embText = "Embedding analysis unavailable";

try {
  console.log("🔥 GEMINI CALLED (combined)");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: combinedPrompt }] }]
  });

  const fullText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Split response — first half is decision, second half is embedding
  const parts = fullText.split('---');
  decisionText = parts[0]?.trim() || fullText;
  embText = parts[1]?.trim() || fullText;

  console.log("✅ GEMINI RESPONSE RECEIVED");

} catch (error) {
  console.error("❌ GEMINI ERROR:", error.message);
}

// ── Step 3 is now removed — embText already set above ─────────
const embResult = {
  similarity_score: sim,
  interpretation: embText
};
    // ── Step 4: Local scoring logic (UNCHANGED) ───────────────
    const trustScore = sim * integrity;
    const viralScore = computeViralScore(scenario, processedMatches.length);
    const finalDecision = applyDecisionRules(trustScore, viralScore);
    const reasoning = buildReasoning(sim, integrity, trustScore, viralScore, finalDecision);

    res.json({
      success: true,
      decision: decisionText || "Fallback decision"
    });

  } catch (err) {
    logger.error('Analysis failed', { message: err.message, scenario });
    // Always return valid response even on error
    res.json({
      success: true,
      decision: "Fallback decision"
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
