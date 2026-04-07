const DEFAULT_MODEL = process.env.GEMINI_SCAN_MODEL || 'gemini-2.5-flash';
const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function parseDataUrl(imageData) {
  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(imageData || '');
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    // Continue to fenced JSON fallback.
  }

  const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!fenced) {
    return null;
  }

  try {
    return JSON.parse(fenced[1]);
  } catch {
    return null;
  }
}

function normalizeReason(reason, fallback) {
  if (typeof reason === 'string' && reason.trim()) {
    return reason.trim();
  }
  return fallback;
}

function createGeminiImageScanner({
  apiKey = "AIzaSyD9m5eN_aDhKQG0K_TIAGF1nOlqFTmPJI4",
  model = DEFAULT_MODEL,
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = global.fetch,
} = {}) {
  const enabled = Boolean(apiKey);

  return {
    enabled,
    async scanImageData({
      imageData,
      challengeId,
      challengeTitle,
      challengeDescription,
      categoryName,
      playerName,
    }) {
      if (!enabled) {
        return {
          allowed: true,
          scanned: true,
          matchedPrompt: true,
          provider: 'gemini',
          model,
          scannedAt: new Date().toISOString(),
          reason: 'Safety scan skipped: GEMINI_API_KEY is not configured.',
        };
      }

      if (typeof fetchImpl !== 'function') {
        throw new Error('No fetch implementation available for Gemini scanner.');
      }

      const parsed = parseDataUrl(imageData);
      if (!parsed) {
        return {
          allowed: false,
          scanned: true,
          matchedPrompt: false,
          provider: 'gemini',
          model,
          scannedAt: new Date().toISOString(),
          reason: 'Could not parse uploaded image data for scanning.',
        };
      }

      const prompt = [
        'You are a strict image evaluator for a university orientation scavenger hunt photo upload.',
        'Analyze the image for two checks: content safety and challenge prompt match.',
        'Disallow sexual content, nudity, graphic violence, hate symbols, self-harm content, illegal drug use, or other unsafe content.',
        'Challenge-match check should confirm the image plausibly satisfies the challenge title/description intent.',
        'Respond with ONLY JSON using this schema: {"allow": boolean, "matchesChallenge": boolean, "reason": string}.',
        `Challenge ID: ${challengeId || 'unknown'}.`,
        `Challenge title: ${challengeTitle || 'unknown'}.`,
        `Challenge description: ${challengeDescription || 'unknown'}.`,
        `Challenge category: ${categoryName || 'unknown'}.`,
        `Player name: ${playerName || 'unknown'}.`,
      ].join(' ');

      const url = `${endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: parsed.mimeType,
                    data: parsed.base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini scan failed (${response.status}): ${errText}`);
      }

      const payload = await response.json();
      const text = (payload.candidates || [])
        .flatMap((candidate) => (candidate.content && candidate.content.parts) || [])
        .map((part) => part.text)
        .filter(Boolean)
        .join('\n');

      const result = extractJsonFromText(text);
      if (!result || typeof result.allow !== 'boolean') {
        return {
          allowed: false,
          scanned: true,
          matchedPrompt: false,
          provider: 'gemini',
          model,
          scannedAt: new Date().toISOString(),
          reason: 'Unable to determine image safety from scanner response.',
        };
      }

      const matchedPrompt =
        typeof result.matchesChallenge === 'boolean'
          ? result.matchesChallenge
          : result.allow === true;

      if (result.allow && matchedPrompt) {
        return {
          allowed: true,
          scanned: true,
          matchedPrompt: true,
          provider: 'gemini',
          model,
          scannedAt: new Date().toISOString(),
          reason: normalizeReason(result.reason, 'Image passed Gemini safety scan.'),
        };
      }

      return {
        allowed: false,
        scanned: true,
        matchedPrompt,
        provider: 'gemini',
        model,
        scannedAt: new Date().toISOString(),
        reason: normalizeReason(result.reason, 'Image failed Gemini safety scan.'),
      };
    },
  };
}

module.exports = {
  createGeminiImageScanner,
};