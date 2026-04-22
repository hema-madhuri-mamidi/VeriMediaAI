/**
 * VeriMedia API Client
 * Drop-in module that routes AI calls to the backend instead of directly to AI providers.
 * Include this BEFORE the main verimedia script.
 * Set window.VERIMEDIA_API_URL to point to your backend.
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const API_BASE = window.VERIMEDIA_API_URL || 'https://verimedia-backend.onrender.com';

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function post(path, body, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Api-Key'] = apiKey;
    const res = await fetch(API_BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(err.error || 'API error'), { status: res.status });
    }
    return res.json();
  }

  async function get(path) {
    const res = await fetch(API_BASE + path);
    return res.json();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.VeriMediaAPI = {
    base: API_BASE,

    /** Health check */
    health: () => get('/api/health'),

    /**
     * Register a content fingerprint
     * @param {Object} params - { fileName, fileSize, scenario }
     */
    registerFingerprint: (params) => post('/api/fingerprint/register', params),

    /**
     * Run full analysis pipeline via backend
     * @param {Object} params - { scenario, contentType, matches, fileHash, fileSize, fileName }
     * @param {string} apiKey - API key (optional if set server-side)
     */
    analyze: (params, apiKey) => post('/api/analyze', params, apiKey),

    /**
     * ML classifier
     * @param {Object} params - { scenario, sim, integrity }
     */
    mlClassify: (params, apiKey) => post('/api/analyze/ml', params, apiKey),

    /**
     * Viral score computation
     * @param {Object} params - { scenario, matchCount, platforms }
     */
    viralScore: (params) => post('/api/analyze/viral', params),

    /**
     * Generate DMCA report
     * @param {Object} params - { platform, user, caption, contentType, analysisData, reporter }
     */
    dmcaReport: (params) => post('/api/report/dmca', params),

    /**
     * Generate full analysis export
     * @param {Object} params - { platform, user, similarity, integrity, decision, reasoning, ... }
     */
    analysisReport: (params) => post('/api/report/analysis', params),

    /**
     * AI-enhanced DMCA notice via Gemini
     */
    aiDmca: (params, apiKey) => post('/api/report/ai-dmca', params, apiKey),
  };

  // ── Intercept AI calls to route through backend ──────────────────────────
  // This patches the existing callClaude function once the page loads,
  // so the frontend uses the backend as a proxy instead of calling AI providers directly.
  function patchCallClaude() {
    if (typeof window.callClaude !== 'function') return;
    const _orig = window.callClaude;
    window.callClaude = async function (prompt, maxT = 700) {
      try {
        // Route through backend analyze endpoint for AI calls
        const apiKey = (typeof window.getApiKey === 'function') ? window.getApiKey() : '';
        const res = await post('/api/analyze/raw', { prompt, maxTokens: maxT }, apiKey || undefined);
        return res.text || '';
      } catch (err) {
        console.warn('[VeriMediaAPI] Backend unavailable, falling back to direct call:', err.message);
        return _orig.apply(this, arguments);
      }
    };
    console.log('[VeriMediaAPI] callClaude patched → backend proxy');
  }

  // ── Intercept DMCA report generation ─────────────────────────────────────
  function patchReportFunctions() {
    if (typeof window.buildTakedownPreviewText === 'function') {
      const _origBuild = window.buildTakedownPreviewText;
      window.buildTakedownPreviewText = function (pl, user, cap, contentType, analysis, caseId, reporter) {
        // Still use local generation for preview (instant), backend for final submission
        return _origBuild.apply(this, arguments);
      };
    }
  }

  // Wait for page ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { patchCallClaude(); patchReportFunctions(); });
  } else {
    setTimeout(() => { patchCallClaude(); patchReportFunctions(); }, 100);
  }

  console.log('[VeriMediaAPI] Client loaded · Backend:', API_BASE);
})();
