const https = require('https');
const http = require('http');
const { URL } = require('url');
const { AI, APP_BASE_URL } = require('../config/env');

// In-memory sliding-window rate limiter: max 30 requests per minute per user
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userKey = String(userId || 'anonymous');
  const timestamps = rateLimitMap.get(userKey) || [];

  // Filter timestamps within current window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  recent.push(now);
  rateLimitMap.set(userKey, recent);

  // Periodic cleanup
  if (rateLimitMap.size > 1000) {
    for (const [key, times] of rateLimitMap.entries()) {
      const valid = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (valid.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, valid);
      }
    }
  }

  return true;
};

const SYSTEM_PROMPT = `You are an expert English grammar, spelling, and clarity correction assistant for industrial plant audit documentation.

Your task is to convert the user's rough, broken, or shorthand notes into a single clear, grammatically correct, professional English statement.

CRITICAL CORRECTION RULES:
1. FIX ALL GRAMMAR, SPELLING & REPETITIONS:
   - Remove accidental duplicate or repeated words (e.g., "not not" -> "not", "is is" -> "is", "an an" -> "a").
   - Fix all spelling errors, typos, and broken words (e.g., "stoopp" -> "mistaken", "moter" -> "motor").
   - Fix incorrect articles and prepositions (e.g., "an stupid" -> "mistaken", "in floor" -> "on the floor").
   - Fix subject-verb agreement and sentence structure.

2. INDUSTRIAL AUDIT PROFESSIONAL TONE:
   - Convert informal, conversational, or broken text into professional phrasing suitable for an audit report.
   - Example: "i m not not an stoopp" -> "I am not mistaken." or "I made an error."
   - Example: "i m an an stoopid" -> "I made an error."
   - Example: "hi how r u i m an wrong" -> "I am mistaken."
   - Example: "motor 15 hp running but vibration high and oil leaking" -> "The 15 HP motor is operational; however, excessive vibration and oil leakage were observed."
   - Example: "machine old and making much noise during working" -> "The machine is aged and generates excessive noise during operation."
   - Example: "Motor ka vibration jyada hai aur oil leakage ho raha hai" -> "Excessive motor vibration and oil leakage were observed."
   - Example: "panel wiring not proper some wire open" -> "The panel wiring is improper, and some wires are exposed."

3. PRESERVE TECHNICAL FACTS:
   - Always keep numerical values, measurements, equipment names, and units exact.
   - Never invent new defects or unmentioned findings.

4. OUTPUT FORMAT:
   - Output ONLY the final corrected sentence.
   - No introductory text, no quotes, no explanations, no thinking bullets.`;

/**
 * Execute HTTP POST request with timeout
 */
const postJSON = (urlString, headers, bodyData, timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const payload = JSON.stringify(bodyData);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AI service request timed out after 15 seconds. Please try again.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Polish auditor's observation into grammatically correct industrial statement
 */
exports.correctAuditorText = async ({ question = '', originalText = '', userId = null }) => {
  if (!originalText || typeof originalText !== 'string' || originalText.trim().length === 0) {
    throw new Error('Original observation text is required.');
  }

  const trimmedText = originalText.trim();
  if (trimmedText.length < 2) {
    throw new Error('Original observation text is too short to correct.');
  }

  if (trimmedText.length > 3000) {
    throw new Error('Observation text exceeds maximum allowed limit of 3,000 characters.');
  }

  // Rate limiting check
  if (userId && !checkRateLimit(userId)) {
    throw new Error('Too many AI correction requests. Please wait a minute before requesting again.');
  }

  // Check API configuration
  const apiKey = AI.API_KEY;
  if (!apiKey) {
    throw new Error(
      'AI service is not configured on this server (missing AUDIT_AI_API_KEY). Please enter observations manually or contact your administrator.'
    );
  }

  const model = AI.MODEL || 'google/gemini-2.5-flash';
  const baseUrl = (AI.BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const userContent = `Input Text to Correct: "${trimmedText}"\n\nCorrected English:`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': APP_BASE_URL || 'http://localhost:3000',
    'X-Title': 'ESM Plant Audit System',
  };

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 600,
  };

  const response = await postJSON(endpoint, headers, body, 15000);

  if (response.status < 200 || response.status >= 300) {
    const errorMsg = response.data?.error?.message || response.data?.message || `AI service returned error code ${response.status}`;
    throw new Error(`AI Correction Failed: ${errorMsg}`);
  }

  const choice = response.data?.choices?.[0];
  let correctedText = choice?.message?.content || '';

  // Clean output: remove extraneous surrounding quotes if the model wrapped output in quotes
  correctedText = correctedText.trim();
  if (
    (correctedText.startsWith('"') && correctedText.endsWith('"')) ||
    (correctedText.startsWith("'") && correctedText.endsWith("'"))
  ) {
    correctedText = correctedText.slice(1, -1).trim();
  }

  // Safety filter: strip any chain-of-thought or reasoning leak
  if (
    correctedText.includes('**Analyze the Request:**') ||
    correctedText.includes('**Analyze the Input:**') ||
    correctedText.includes('**Strict Rules:**')
  ) {
    const lines = correctedText.split('\n').map(l => l.trim()).filter(Boolean);
    const nonBulletLines = lines.filter(l => !l.startsWith('*') && !l.startsWith('1.') && !l.startsWith('2.') && !l.startsWith('3.'));
    if (nonBulletLines.length > 0) {
      correctedText = nonBulletLines[nonBulletLines.length - 1];
    } else {
      const cleaned = trimmedText.charAt(0).toUpperCase() + trimmedText.slice(1).replace(/\s+/g, ' ');
      correctedText = cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
    }
  }

  if (!correctedText) {
    // Graceful fallback: clean up capitalization and basic punctuation rather than failing
    const cleaned = trimmedText.charAt(0).toUpperCase() + trimmedText.slice(1).replace(/\s+/g, ' ');
    return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
  }

  return correctedText;
};

