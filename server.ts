import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import dns from "dns";
import net from "net";
import { execFile } from "child_process";
import { promisify } from "util";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { EventEmitter } from "events";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import firebaseConfig from "./firebase-applet-config.json";

EventEmitter.defaultMaxListeners = 50;
process.setMaxListeners(50);

dotenv.config();

const OWNER_EMAIL = "alahsaey@gmail.com";

if (getAdminApps().length === 0) {
  initializeAdminApp({
    projectId: firebaseConfig.projectId,
  });
}

// Strong secret for short-lived WebAuthn challenges and admin session tokens
const SESSION_HMAC_KEY =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Passkey seal key: prefers SESSION_SECRET; retains backward-compatible fallback when unset
const PASSKEY_SEAL_KEY =
  process.env.SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(`abf-server-hmac:${firebaseConfig.projectId}:${firebaseConfig.appId}`)
    .digest("hex");

// In-memory replay guard, token revocation registry, and hint rate-limit buckets
const usedChallengeNonces = new Map<string, number>();
const revokedSessionJtis = new Map<string, number>();
const hintRateBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of usedChallengeNonces.entries()) {
    if (exp < now) usedChallengeNonces.delete(k);
  }
  for (const [k, exp] of revokedSessionJtis.entries()) {
    if (exp < now) revokedSessionJtis.delete(k);
  }
  for (const [k, bucket] of hintRateBuckets.entries()) {
    if (bucket.resetAt < now) hintRateBuckets.delete(k);
  }
}, 5 * 60 * 1000).unref();

function hmacSign(payload: string, key = SESSION_HMAC_KEY): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signToken(data: Record<string, any>): string {
  const encoded = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  const sig = hmacSign(encoded);
  return `${encoded}.${sig}`;
}

function verifySignedToken<T = any>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = hmacSign(encoded);
    if (!safeTimingEqual(sig, expectedSig)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function computePasskeyIntegrity(input: {
  credentialId: string;
  publicKeyB64: string;
  rpId: string;
  userEmail: string;
}): string {
  return hmacSign(
    `passkey:v1:${input.credentialId}:${input.publicKeyB64}:${input.rpId}:${input.userEmail.toLowerCase()}`,
    PASSKEY_SEAL_KEY
  );
}

function resolveOriginAndRpId(req: express.Request): { origin: string; rpId: string } {
  const headerOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const bodyOrigin = typeof req.body?.clientOrigin === "string" ? req.body.clientOrigin : "";
  const rawOrigin = bodyOrigin || headerOrigin;

  if (rawOrigin) {
    try {
      const u = new URL(rawOrigin);
      if (u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) {
        return { origin: u.origin, rpId: u.hostname };
      }
    } catch {
      // ignore invalid URL
    }
  }

  const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost:3000";
  const hostClean = forwardedHost.split(",")[0].trim();
  const rpId = hostClean.split(":")[0];
  const proto = ((req.headers["x-forwarded-proto"] as string) || req.protocol || "http").split(",")[0].trim();
  return { origin: `${proto}://${hostClean}`, rpId };
}

async function verifyFirebaseIdTokenFromRequest(
  req: express.Request
): Promise<{ uid: string; email: string; emailVerified: boolean; name?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email || decoded.email_verified !== true) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      emailVerified: !!decoded.email_verified,
      name: decoded.name,
    };
  } catch (err: any) {
    console.warn("[AUTH] Firebase ID token verification failed:", err?.message || err);
    return null;
  }
}

function isBlockedPrivateIp(ip: string): boolean {
  const cleaned = ip.replace(/^::ffff:/i, "").trim().toLowerCase();
  const ver = net.isIP(cleaned);
  if (ver === 4) {
    const parts = cleaned.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (ver === 6) {
    if (cleaned === "::1" || cleaned === "::") return true;
    if (cleaned.startsWith("fc") || cleaned.startsWith("fd")) return true; // ULA
    if (/^fe[89ab]/i.test(cleaned)) return true; // link-local
    return false;
  }
  return true;
}

async function assertSafePublicUrl(rawUrl: string): Promise<{ ok: boolean; url?: URL; message?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, message: "صيغة الرابط غير صحيحة." };
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { ok: false, message: "رابط غير صالح: يجب أن يبدأ بـ https:// أو http://" };
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return { ok: false, message: "غير مسموح بالوصول إلى عناوين الشبكة الداخلية أو المحلية." };
  }

  if (net.isIP(host)) {
    if (isBlockedPrivateIp(host)) {
      return { ok: false, message: "غير مسموح بالوصول إلى عناوين IP الخاصة أو المحلية." };
    }
    return { ok: true, url: parsedUrl };
  }

  try {
    const records = await dns.promises.lookup(host, { all: true });
    if (!records || records.length === 0) {
      return { ok: false, message: "تعذر حل اسم النطاق للرابط المطلوب." };
    }
    for (const rec of records) {
      if (isBlockedPrivateIp(rec.address)) {
        return { ok: false, message: "الرابط يشير إلى عنوان شبكة خاص أو محلي غير مسموح به." };
      }
    }
  } catch {
    return { ok: false, message: "تعذر التحقق من نطاق الرابط المطلوب." };
  }

  return { ok: true, url: parsedUrl };
}

async function requireAdminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // 1. Check Firebase Google Auth ID Token (Authorization: Bearer <idToken>)
  const firebaseUser = await verifyFirebaseIdTokenFromRequest(req);
  if (firebaseUser) {
    (req as any).adminUser = {
      email: firebaseUser.email,
      isOwner: firebaseUser.email === OWNER_EMAIL,
      authMethod: "google",
    };
    return next();
  }

  // 2. Check server-issued WebAuthn Admin Session Token (X-Admin-Session or Bearer fallback)
  const headerSessionToken =
    (typeof req.headers["x-admin-session"] === "string" ? req.headers["x-admin-session"].trim() : "") ||
    (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : "");

  if (headerSessionToken) {
    const payload = verifySignedToken<{
      jti: string;
      email: string;
      role: string;
      authMethod: string;
      exp: number;
    }>(headerSessionToken);

    if (payload && !revokedSessionJtis.has(payload.jti)) {
      (req as any).adminUser = {
        email: payload.email,
        isOwner: payload.email?.toLowerCase() === OWNER_EMAIL,
        authMethod: payload.authMethod || "webauthn",
      };
      return next();
    }
  }

  return res.status(401).json({
    error: "هذه العملية محمية وتتطلب تسجيل الدخول بحساب الإدارة المعتمد أولاً.",
  });
}

function hintRateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxReqs = 30;
  const bucket = hintRateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    hintRateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (bucket.count >= maxReqs) {
    return res.status(429).json({
      error: "تم تجاوز الحد المؤقت لطلبات التلميحات. يرجى الانتظار قليلاً ثم المحاولة.",
    });
  }
  bucket.count += 1;
  return next();
}

async function fetchReadableSourceContent(url: string): Promise<{
  ok: boolean;
  statusCode?: number;
  title?: string;
  text: string;
  message: string;
}> {
  const urlCheck = await assertSafePublicUrl(url);
  if (!urlCheck.ok) {
    return { ok: false, text: "", message: urlCheck.message };
  }

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  ];

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.get(urlCheck.url.toString(), {
        headers: {
          "User-Agent": userAgents[attempt],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
        timeout: 22000,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      });

      const finalUrl = response.request?.res?.responseUrl;
      if (typeof finalUrl === "string" && finalUrl && finalUrl !== urlCheck.url.toString()) {
        const redirectCheck = await assertSafePublicUrl(finalUrl);
        if (!redirectCheck.ok) {
          return { ok: false, text: "", message: redirectCheck.message };
        }
      }

      if (response.status === 403 || response.status === 401) {
        return {
          ok: false,
          statusCode: response.status,
          text: "",
          message: "الموقع يفرض حماية تمنع القراءة الآلية (403/401). يمكنك لصق النص الموثق يدوياً في خانة النص المعتمد داخل إدارة المصادر.",
        };
      }

      if (response.status >= 400) {
        return {
          ok: false,
          statusCode: response.status,
          text: "",
          message: `استجابة غير صالحة من المصدر (${response.status}).`,
        };
      }

      const raw = typeof response.data === "string" ? response.data : String(response.data || "");
      const $ = cheerio.load(raw);
      const title = ($("title").first().text() || "").replace(/\s+/g, " ").trim();
      $("script, style, nav, footer, header, noscript, aside, iframe, form").remove();
      const bodyText = ($("main").text() || $("article").text() || $("body").text() || "")
        .replace(/\s+/g, " ")
        .trim();

      if (bodyText.length < 120) {
        return {
          ok: false,
          statusCode: response.status,
          title,
          text: bodyText,
          message: "تم الاتصال بالرابط ولكن النص المقروء قليل جداً أو يتطلب تصفحاً تفاعلياً. أضف النص الموثق يدوياً في بيانات المصدر.",
        };
      }

      return {
        ok: true,
        statusCode: response.status,
        title,
        text: bodyText.substring(0, 35000),
        message: "تم فحص المصدر وقراءة محتواه بنجاح.",
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  return {
    ok: false,
    text: "",
    message: `تعذر الوصول للمصدر (${lastError?.message || "خطأ اتصال"}). يرجى التحقق من الرابط أو تزويد النص الموثق يدوياً.`,
  };
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isRetryableGeminiError(err: any): boolean {
  const status = err?.status ?? err?.code ?? err?.error?.code;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("unavailable") ||
    msg.includes("resource_exhausted") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  );
}

function formatGeminiErrorMessage(err: any): string {
  const raw = String(err?.message || err || "");
  const lower = raw.toLowerCase();
  if (lower.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "تم تجاوز حد الطلبات المؤقت لواجهة الذكاء الاصطناعي. يرجى الانتظار قليلاً ثم إعادة المحاولة.";
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded")) {
    return "خدمة الذكاء الاصطناعي تشهد ضغطاً مؤقتاً في الطلبات حالياً (503). يرجى إعادة المحاولة بعد بضع ثوانٍ.";
  }
  return raw || "حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي.";
}

async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; onRetry?: (attempt: number, maxRetries: number) => void }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryableGeminiError(err)) {
        throw err;
      }
      const backoffMs = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 450);
      console.warn(
        `[GEMINI RETRY] Attempt ${attempt + 1}/${maxRetries} failed (${err?.status || err?.message || "transient"}). Retrying in ${backoffMs}ms...`
      );
      options?.onRetry?.(attempt + 1, maxRetries);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

function safeJsonParse(raw: string): any {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {}
    }
    return null;
  }
}

// =========================================================================
// INTELLIGENT VIDEO FETCHING, TRANSCRIPTION & SCENE CLIPPING HELPERS
// =========================================================================

const execFileAsync = promisify(execFile);
const VIDEO_CACHE_DIR = path.join(process.cwd(), ".cache", "videos");
const CLIP_CACHE_DIR = path.join(process.cwd(), ".cache", "clips");
const TEMP_AUDIO_DIR = path.join(process.cwd(), ".cache", "audio-tmp");

for (const dir of [VIDEO_CACHE_DIR, CLIP_CACHE_DIR, TEMP_AUDIO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

interface VideoTranscriptSeg {
  start: number;
  end: number;
  text: string;
}

interface VideoJobState {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stepLabel: string;
  createdAt: number;
  result?: any;
  error?: string;
}

const videoJobs = new Map<string, VideoJobState>();

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of videoJobs.entries()) {
    if (job.createdAt < cutoff) videoJobs.delete(id);
  }
}, 15 * 60 * 1000).unref();

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      return id && id.length === 11 ? id : null;
    }
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && v.length === 11) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
      if (embedIdx >= 0 && parts[embedIdx + 1]?.length === 11) {
        return parts[embedIdx + 1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

function resolveLocalVideoInput(videoUrlOrStream: string): string {
  if (videoUrlOrStream.startsWith("/api/video/stream/")) {
    const fileId = videoUrlOrStream.replace("/api/video/stream/", "").split("?")[0];
    if (/^[a-zA-Z0-9._-]+$/.test(fileId)) {
      const localPath = path.join(VIDEO_CACHE_DIR, fileId);
      if (fs.existsSync(localPath)) return localPath;
    }
  }
  return videoUrlOrStream;
}

async function probeMediaMetadata(inputSource: string): Promise<{ duration: number; hasAudio: boolean }> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputSource],
      { timeout: 25000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout || "{}");
    const dur = Math.round(Number(parsed?.format?.duration || 0));
    const hasAudio = Array.isArray(parsed?.streams)
      ? parsed.streams.some((s: any) => s.codec_type === "audio")
      : true;
    return { duration: Number.isFinite(dur) ? Math.max(0, dur) : 0, hasAudio };
  } catch (err: any) {
    console.warn("[FFPROBE] probe failed:", err?.message || err);
    return { duration: 0, hasAudio: false };
  }
}

function formatSecToMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function parseTimestampToken(token: string): number {
  const parts = token.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseTimestampedTranscriptLines(rawText: string, offsetSec = 0, fallbackDuration = 60): VideoTranscriptSeg[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const segments: VideoTranscriptSeg[] = [];
  const lineRegex = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]?\s*[:\-–]?\s*(.+)$/;

  for (const line of lines) {
    const m = line.match(lineRegex);
    if (m) {
      const start = parseTimestampToken(m[1]) + offsetSec;
      const explicitEnd = m[2] ? parseTimestampToken(m[2]) + offsetSec : 0;
      const text = m[3].trim();
      if (text) {
        segments.push({
          start,
          end: explicitEnd > start ? explicitEnd : start + 8,
          text,
        });
      }
    } else if (segments.length > 0) {
      segments[segments.length - 1].text += ` ${line}`;
    } else {
      segments.push({
        start: offsetSec,
        end: offsetSec + Math.max(10, fallbackDuration),
        text: line,
      });
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i + 1].start > segments[i].start) {
      segments[i].end = Math.max(segments[i].start + 2, segments[i + 1].start);
    }
  }
  return segments;
}

async function fetchYouTubeMetadataAndCaptions(videoUrl: string): Promise<{
  videoId: string;
  title: string;
  thumbnailUrl: string;
  totalDuration: number;
  transcriptSegments: VideoTranscriptSeg[];
  restrictsDirectDownload: boolean;
  message: string;
}> {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    throw new Error("تعذر استخراج معرف فيديو YouTube من الرابط.");
  }

  let title = "فيديو موثق من YouTube";
  let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  let totalDuration = 0;
  let transcriptSegments: VideoTranscriptSeg[] = [];

  try {
    const oembedRes = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { timeout: 10000 }
    );
    if (oembedRes.data?.title) title = String(oembedRes.data.title);
    if (oembedRes.data?.thumbnail_url) thumbnailUrl = String(oembedRes.data.thumbnail_url);
  } catch {
    // Fallback to HTML title if oEmbed blocked
  }

  try {
    const watchRes = await axios.get(`https://www.youtube.com/watch?v=${videoId}&hl=ar`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
      },
      timeout: 15000,
    });
    const html = typeof watchRes.data === "string" ? watchRes.data : "";
    const lenMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
    if (lenMatch) totalDuration = Number(lenMatch[1]) || 0;

    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && title === "فيديو موثق من YouTube") {
      title = titleMatch[1].replace(/\s*-\s*YouTube\s*$/i, "").trim();
    }

    const tracksMatch = html.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"audioTracks"/);
    const fallbackTracksMatch = !tracksMatch ? html.match(/"captionTracks"\s*:\s*(\[.*?\])/) : null;
    const rawTracks = tracksMatch?.[1] || fallbackTracksMatch?.[1];

    if (rawTracks) {
      const tracks = JSON.parse(rawTracks);
      if (Array.isArray(tracks) && tracks.length > 0) {
        const picked =
          tracks.find((t: any) => String(t.languageCode || "").startsWith("ar") && t.kind !== "asr") ||
          tracks.find((t: any) => String(t.languageCode || "").startsWith("ar")) ||
          tracks[0];

        if (picked?.baseUrl) {
          const capUrl = `${picked.baseUrl}&fmt=json3`;
          const capRes = await axios.get(capUrl, { timeout: 12000 });
          const events = capRes.data?.events;
          if (Array.isArray(events)) {
            for (const ev of events) {
              const segText = Array.isArray(ev.segs)
                ? ev.segs.map((s: any) => s.utf8 || "").join("").replace(/\s+/g, " ").trim()
                : "";
              if (!segText) continue;
              const start = Math.max(0, Number(ev.tStartMs || 0) / 1000);
              const dur = Math.max(1, Number(ev.dDurationMs || 4000) / 1000);
              transcriptSegments.push({
                start: Math.round(start * 10) / 10,
                end: Math.round((start + dur) * 10) / 10,
                text: segText,
              });
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[YOUTUBE] caption/metadata inspect notice:", err?.message || err);
  }

  if (totalDuration === 0 && transcriptSegments.length > 0) {
    totalDuration = Math.ceil(transcriptSegments[transcriptSegments.length - 1].end);
  }

  const message =
    transcriptSegments.length > 0
      ? "تم جلب بيانات الفيديو ونص الترجمة الزمنية من YouTube بنجاح."
      : "تم جلب بيانات الفيديو من YouTube. المنصة تفرض قيوداً على التحميل المباشر ولا تتوفر ترجمة نصية مفعلة؛ يمكنك لصق نص التفريغ أو رفع ملف الصوت لاستخراج المقاطع بالذكاء الاصطناعي.";

  return {
    videoId,
    title,
    thumbnailUrl,
    totalDuration,
    transcriptSegments,
    restrictsDirectDownload: true,
    message,
  };
}

async function transcribeDirectMediaWithGemini(
  ai: GoogleGenAI,
  inputSource: string,
  totalDuration: number,
  onProgress?: (pct: number, label: string) => void
): Promise<VideoTranscriptSeg[]> {
  const effectiveDuration = totalDuration > 0 ? totalDuration : 600;
  const chunkLengthSec = 540; // 9 minutes per compact MP3 chunk to remain comfortably under inline limits
  const numChunks = Math.min(6, Math.max(1, Math.ceil(effectiveDuration / chunkLengthSec)));
  const allSegments: VideoTranscriptSeg[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkLengthSec;
    const chunkDur = Math.min(chunkLengthSec, Math.max(15, effectiveDuration - startSec));
    const tmpMp3 = path.join(TEMP_AUDIO_DIR, `chunk_${crypto.randomBytes(8).toString("hex")}.mp3`);

    try {
      onProgress?.(
        35 + Math.round((i / numChunks) * 28),
        `تحويل الصوت إلى نص زمني دقيق (الجزء ${i + 1} من ${numChunks})...`
      );

      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(startSec),
          "-t",
          String(chunkDur),
          "-i",
          inputSource,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-b:a",
          "32k",
          tmpMp3,
        ],
        { timeout: 120000 }
      );

      if (!fs.existsSync(tmpMp3)) continue;
      const audioBuf = fs.readFileSync(tmpMp3);
      if (audioBuf.length < 512) continue;

      const audioPart = {
        inlineData: {
          mimeType: "audio/mp3",
          data: audioBuf.toString("base64"),
        },
      };

      const resp = await callGeminiWithRetry(
        () =>
          ai.models.generateContent({
            model: "gemini-3.5-transcribe",
            contents: {
              parts: [
                audioPart,
                {
                  text: "فرّغ هذا التسجيل الصوتي باللغة العربية بدقة كاملة وبشكل أسطر زمنية واضحة بالصيغة التالية في كل سطر: [MM:SS] النص المنطوق حرفياً. لا تحذف أي تفصيل مهم أو اسم أو رقم أو دليل علمي.",
                },
              ],
            },
          }),
        {
          maxRetries: 3,
          onRetry: (attempt) => {
            onProgress?.(
              35 + Math.round((i / numChunks) * 28),
              `خدمة التفريغ مزدحمة مؤقتاً، إعادة المحاولة (${attempt}/3) للجزء ${i + 1}...`
            );
          },
        }
      );

      const rawTranscript = (resp.text || "").trim();
      if (rawTranscript) {
        const parsedSegs = parseTimestampedTranscriptLines(rawTranscript, startSec, chunkDur);
        allSegments.push(...parsedSegs);
      }
    } finally {
      if (fs.existsSync(tmpMp3)) {
        try {
          fs.unlinkSync(tmpMp3);
        } catch {}
      }
    }
  }

  return allSegments;
}

function buildCompactTimestampedTranscript(segments: VideoTranscriptSeg[], maxChars = 30000): string {
  const lines: string[] = [];
  let len = 0;
  for (const s of segments) {
    const line = `[${formatSecToMMSS(s.start)} - ${formatSecToMMSS(s.end)}] ${s.text}`;
    if (len + line.length + 1 > maxChars) break;
    lines.push(line);
    len += line.length + 1;
  }
  return lines.join("\n");
}

function clampClipWithNaturalBounds(
  rawStart: number,
  rawEnd: number,
  totalDuration: number,
  segments: VideoTranscriptSeg[]
): { startTime: number; endTime: number; duration: number } {
  let start = Math.max(0, Math.floor(Number(rawStart) || 0));
  let end = Math.max(start + 8, Math.ceil(Number(rawEnd) || start + 20));

  // Snap smoothly to spoken transcript segment boundaries when overlapping mid-sentence
  if (segments.length > 0) {
    const startSeg = segments.find((s) => s.start <= start && s.end > start);
    if (startSeg && start - startSeg.start <= 12) {
      start = Math.max(0, Math.floor(startSeg.start));
    }
    const endSeg = segments.find((s) => s.start < end && s.end >= end);
    if (endSeg && endSeg.end - end <= 12) {
      end = Math.ceil(endSeg.end);
    }
  }

  // Add subtle protective speech padding (min 3s before/after if available without overflowing)
  start = Math.max(0, start - 2);
  end = end + 2;

  if (totalDuration > 0) {
    start = Math.min(start, Math.max(0, totalDuration - 5));
    end = Math.min(totalDuration, Math.max(start + 4, end));
  }

  return {
    startTime: start,
    endTime: end,
    duration: Math.max(1, end - start),
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", true);
  app.use(express.json({ limit: "12mb" }));

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BOOT] Server listening on http://0.0.0.0:${PORT}`);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[CRITICAL] Unhandled Rejection at:", promise, "reason:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[CRITICAL] Uncaught Exception:", error);
  });

  // Health Check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      aiConfigured: !!process.env.GEMINI_API_KEY,
    });
  });

  // Authoritative Server Clock for Synchronized Competition Timers
  app.get("/api/time", (_req, res) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.json({
      serverTime: Date.now(),
    });
  });

  // =========================================================================
  // AUTH & SERVER-VERIFIED WEBAUTHN PASSKEYS
  // =========================================================================

  app.post("/api/auth/session/verify", async (req, res) => {
    const firebaseUser = await verifyFirebaseIdTokenFromRequest(req);
    if (firebaseUser) {
      return res.json({
        authenticated: true,
        authMethod: "google",
        email: firebaseUser.email,
        uid: firebaseUser.uid,
        isOwner: firebaseUser.email === OWNER_EMAIL,
      });
    }

    const sessionToken = typeof req.body?.adminSessionToken === "string" ? req.body.adminSessionToken : "";
    if (sessionToken) {
      const payload = verifySignedToken<{
        jti: string;
        email: string;
        role: string;
        authMethod: string;
        exp: number;
      }>(sessionToken);

      if (payload && !revokedSessionJtis.has(payload.jti)) {
        return res.json({
          authenticated: true,
          authMethod: payload.authMethod || "webauthn",
          email: payload.email,
          isOwner: payload.email.toLowerCase() === OWNER_EMAIL,
          role: payload.role,
          expiresAt: payload.exp,
        });
      }
    }

    return res.status(401).json({ authenticated: false });
  });

  app.post("/api/auth/logout", (req, res) => {
    const sessionToken = typeof req.body?.adminSessionToken === "string" ? req.body.adminSessionToken : "";
    if (sessionToken) {
      const payload = verifySignedToken<{ jti: string; exp: number }>(sessionToken);
      if (payload?.jti) {
        revokedSessionJtis.set(payload.jti, payload.exp || Date.now() + 12 * 3600 * 1000);
      }
    }
    res.json({ success: true });
  });

  app.post("/api/auth/webauthn/register-options", async (req, res) => {
    try {
      const firebaseUser = await verifyFirebaseIdTokenFromRequest(req);
      if (!firebaseUser) {
        return res.status(401).json({
          error: "يجب تسجيل الدخول بحساب Google المعتمد وتأكيد البريد الإلكتروني قبل تفعيل البصمة على هذا الجهاز.",
        });
      }

      if (firebaseUser.email !== OWNER_EMAIL) {
        return res.status(403).json({
          error: `تفعيل بصمة المالك محصور بالحساب المعتمد (${OWNER_EMAIL}).`,
        });
      }

      const { origin, rpId } = resolveOriginAndRpId(req);
      const excludeIds: string[] = Array.isArray(req.body?.excludeCredentialIds)
        ? req.body.excludeCredentialIds.filter((x: any) => typeof x === "string")
        : [];

      const options = await generateRegistrationOptions({
        rpName: "مسابقة ابوالفواطم",
        rpID: rpId,
        userName: firebaseUser.email,
        userDisplayName: firebaseUser.name || "مسؤول مسابقة ابوالفواطم",
        attestationType: "none",
        excludeCredentials: excludeIds.map((id) => ({ id })),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        timeout: 60000,
      });

      const nonce = crypto.randomBytes(16).toString("hex");
      const challengeToken = signToken({
        type: "webauthn_reg",
        challenge: options.challenge,
        rpId,
        origin,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        nonce,
        exp: Date.now() + 3 * 60 * 1000,
      });

      return res.json({ options, challengeToken });
    } catch (err: any) {
      console.error("[WEBAUTHN] register-options error:", err);
      return res.status(500).json({ error: err?.message || "تعذر تجهيز تحدي تسجيل البصمة." });
    }
  });

  app.post("/api/auth/webauthn/register-verify", async (req, res) => {
    try {
      const firebaseUser = await verifyFirebaseIdTokenFromRequest(req);
      if (!firebaseUser || firebaseUser.email !== OWNER_EMAIL) {
        return res.status(403).json({ error: "غير مصرح بتسجيل جهاز جديد." });
      }

      const { registrationResponse, challengeToken, deviceName } = req.body || {};
      if (!registrationResponse || typeof challengeToken !== "string") {
        return res.status(400).json({ error: "بيانات التحقق غير مكتملة." });
      }

      const challengePayload = verifySignedToken<{
        type: string;
        challenge: string;
        rpId: string;
        origin: string;
        uid: string;
        email: string;
        nonce: string;
        exp: number;
      }>(challengeToken);

      if (
        !challengePayload ||
        challengePayload.type !== "webauthn_reg" ||
        challengePayload.email !== firebaseUser.email ||
        usedChallengeNonces.has(challengePayload.nonce)
      ) {
        return res.status(400).json({ error: "انتهت صلاحية التحدي الأمني أو استُخدم مسبقاً. أعد المحاولة." });
      }

      usedChallengeNonces.set(challengePayload.nonce, challengePayload.exp);

      const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challengePayload.challenge,
        expectedOrigin: challengePayload.origin,
        expectedRPID: challengePayload.rpId,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "فشل التحقق التشفيري من بصمة الجهاز." });
      }

      const { credential } = verification.registrationInfo;
      const publicKeyB64 = Buffer.from(credential.publicKey).toString("base64url");
      const integrityHash = computePasskeyIntegrity({
        credentialId: credential.id,
        publicKeyB64,
        rpId: challengePayload.rpId,
        userEmail: firebaseUser.email,
      });

      const maskedEmail = firebaseUser.email.replace(/^(.{2,3})(.*)(@.*)$/, "$1***$3");

      return res.json({
        verified: true,
        passkey: {
          credentialId: credential.id,
          publicKeyB64,
          counter: credential.counter,
          transports: credential.transports || [],
          rpId: challengePayload.rpId,
          deviceName: typeof deviceName === "string" && deviceName.trim() ? deviceName.trim() : "جهاز معتمد بالبصمة",
          userEmailMasked: maskedEmail,
          isActive: true,
          integrityHash,
        },
      });
    } catch (err: any) {
      console.error("[WEBAUTHN] register-verify error:", err);
      return res.status(400).json({ error: err?.message || "فشل التحقق من تسجيل البصمة." });
    }
  });

  app.post("/api/auth/webauthn/login-options", async (req, res) => {
    try {
      const { origin, rpId } = resolveOriginAndRpId(req);
      const allowCredentialIds: string[] = Array.isArray(req.body?.credentialIds)
        ? req.body.credentialIds.filter((id: any) => typeof id === "string" && id.length > 0)
        : [];

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: "required",
        timeout: 60000,
        allowCredentials:
          allowCredentialIds.length > 0
            ? allowCredentialIds.map((id) => ({ id }))
            : undefined,
      });

      const nonce = crypto.randomBytes(16).toString("hex");
      const challengeToken = signToken({
        type: "webauthn_login",
        challenge: options.challenge,
        rpId,
        origin,
        nonce,
        exp: Date.now() + 3 * 60 * 1000,
      });

      return res.json({ options, challengeToken });
    } catch (err: any) {
      console.error("[WEBAUTHN] login-options error:", err);
      return res.status(500).json({ error: err?.message || "تعذر إنشاء تحدي الدخول بالبصمة." });
    }
  });

  app.post("/api/auth/webauthn/login-verify", async (req, res) => {
    try {
      const { assertionResponse, challengeToken, passkeyRecord } = req.body || {};
      if (!assertionResponse || typeof challengeToken !== "string" || !passkeyRecord) {
        return res.status(400).json({ error: "بيانات المصادقة البيومترية ناقصة." });
      }

      const challengePayload = verifySignedToken<{
        type: string;
        challenge: string;
        rpId: string;
        origin: string;
        nonce: string;
        exp: number;
      }>(challengeToken);

      if (!challengePayload || challengePayload.type !== "webauthn_login" || usedChallengeNonces.has(challengePayload.nonce)) {
        return res.status(400).json({ error: "انتهت صلاحية جلسة الفحص البيومتري. يرجى المحاولة مجدداً." });
      }
      usedChallengeNonces.set(challengePayload.nonce, challengePayload.exp);

      if (passkeyRecord.isActive === false) {
        return res.status(403).json({ error: "تم تعطيل هذا الجهاز من قائمة الأجهزة الموثوقة." });
      }

      // Verify server-issued HMAC seal so public key / email cannot be spoofed client-side
      const expectedSeal = computePasskeyIntegrity({
        credentialId: passkeyRecord.credentialId,
        publicKeyB64: passkeyRecord.publicKeyB64,
        rpId: passkeyRecord.rpId || challengePayload.rpId,
        userEmail: OWNER_EMAIL,
      });

      if (!passkeyRecord.integrityHash || !safeTimingEqual(passkeyRecord.integrityHash, expectedSeal)) {
        return res.status(403).json({ error: "فشل التحقق من سلامة سجل البصمة المسجل لهذا الجهاز." });
      }

      const verification = await verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: challengePayload.challenge,
        expectedOrigin: challengePayload.origin,
        expectedRPID: passkeyRecord.rpId || challengePayload.rpId,
        requireUserVerification: true,
        credential: {
          id: passkeyRecord.credentialId,
          publicKey: new Uint8Array(Buffer.from(passkeyRecord.publicKeyB64, "base64url")),
          counter: Number(passkeyRecord.counter || 0),
          transports: Array.isArray(passkeyRecord.transports) ? passkeyRecord.transports : undefined,
        },
      });

      if (!verification.verified) {
        return res.status(401).json({ error: "فشلت مطابقة التوقيع التشفيري لبصمة الجهاز." });
      }

      const jti = crypto.randomBytes(16).toString("hex");
      const exp = Date.now() + 12 * 3600 * 1000;
      const adminSessionToken = signToken({
        jti,
        email: OWNER_EMAIL,
        role: "owner",
        authMethod: "webauthn",
        credentialId: passkeyRecord.credentialId,
        exp,
      });

      return res.json({
        verified: true,
        email: OWNER_EMAIL,
        role: "owner",
        newCounter: verification.authenticationInfo.newCounter,
        adminSessionToken,
        expiresAt: exp,
      });
    } catch (err: any) {
      console.error("[WEBAUTHN] login-verify error:", err);
      return res.status(401).json({ error: err?.message || "تعذر التحقق من بصمة الجهاز." });
    }
  });

  // =========================================================================
  // APPROVED SHIA SOURCES VERIFICATION
  // =========================================================================

  app.post("/api/sources/verify", requireAdminAuth, async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ ok: false, message: "يرجى إدخال رابط المصدر أولاً." });
    }
    const result = await fetchReadableSourceContent(url.trim());
    return res.json({
      ok: result.ok,
      statusCode: result.statusCode,
      title: result.title || "",
      textLength: result.text.length,
      preview: result.text.substring(0, 800),
      extractedText: result.ok ? result.text.substring(0, 15000) : "",
      message: result.message,
    });
  });

  app.post("/api/fetch-url", requireAdminAuth, async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }
    const result = await fetchReadableSourceContent(url.trim());
    if (!result.ok) {
      return res.status(result.statusCode === 403 ? 403 : 422).json({ error: result.message });
    }
    return res.json({ text: result.text, title: result.title });
  });

  // =========================================================================
  // STRICT SHIA-SOURCES-GROUNDED AI ENGINE (SERVER-SIDE GEMINI-4-HYDROGEN)
  // =========================================================================

  app.post("/api/ai/generate-questions", requireAdminAuth, async (req, res) => {
    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: "مفتاح GEMINI_API_KEY غير مضبوط على الخادم. يرجى إضافته في إعدادات البيئة.",
      });
    }

    const {
      categoryName,
      categoryDescription,
      approvedSources,
      difficulty = "medium",
      questionTypes = ["multiple_choice"],
      count = 5,
      existingQuestions = [],
      letter,
      scoringSettings,
      autoApproveVerifiedAI = false,
    } = req.body || {};

    if (!categoryName || !Array.isArray(approvedSources)) {
      return res.status(400).json({ error: "يجب تحديد القسم والمصادر الشيعية المعتمدة أولاً." });
    }

    // Strict Whitelist Filtering: Keep ONLY approved sources
    const whitelist = approvedSources.filter((s: any) => s && s.isApproved === true && (s.url || s.verifiedExcerpt));
    if (whitelist.length === 0) {
      return res.json({
        insufficientSource: true,
        message: "لا توجد مصادر شيعية معتمدة ومفعلة مرتبطة بهذا القسم أو مختارة للتوليد. يمنع التوليد دون مصدر معتمد.",
        questions: [],
      });
    }

    // Gather verified readable excerpts from each approved source (never rely on general LLM memory)
    const corpusParts: {
      id: string;
      name: string;
      url: string;
      author: string;
      classification: string;
      text: string;
    }[] = [];

    for (const src of whitelist.slice(0, 4)) {
      let usableText = typeof src.verifiedExcerpt === "string" ? src.verifiedExcerpt.trim() : "";
      if (usableText.length < 150 && src.url) {
        const fetched = await fetchReadableSourceContent(src.url);
        if (fetched.ok && fetched.text.length >= 120) {
          usableText = usableText ? `${usableText}\n\n${fetched.text}` : fetched.text;
        }
      }
      if (usableText.length >= 120) {
        corpusParts.push({
          id: src.id || "",
          name: src.name,
          url: src.url || "",
          author: src.author || "",
          classification: src.classification || "",
          text: usableText.substring(0, 14000),
        });
      }
    }

    if (corpusParts.length === 0) {
      return res.json({
        insufficientSource: true,
        message:
          "المصدر المعتمد المختار لا يحتوي على نص مقروء كافٍ أو حظر الجلب الآلي، ولا يوجد نص موثق مضاف له. يرجى إضافة النص الموثق للمصدر في (إدارة المصادر المعتمدة) ثم إعادة المحاولة.",
        questions: [],
      });
    }

    const clampedCount = Math.min(Math.max(Number(count) || 5, 1), 15);
    const pointByDiff: Record<string, number> = {
      easy: Number(scoringSettings?.easyPoints) || 20,
      medium: Number(scoringSettings?.mediumPoints) || 40,
      hard: Number(scoringSettings?.hardPoints) || 60,
      expert: Number(scoringSettings?.expertPoints) || 80,
    };

    const allowedSourceUrls = new Set(corpusParts.map((c) => c.url.trim().toLowerCase()).filter(Boolean));
    const allowedSourceNames = new Set(corpusParts.map((c) => c.name.trim().toLowerCase()));

    const sourcesBundleText = corpusParts
      .map(
        (c, idx) =>
          `=== المصدر المعتمد (${idx + 1}) ===\nاسم المصدر: ${c.name}\nالمؤلف: ${c.author || "غير محدد"}\nالرابط المعتمد: ${c.url}\nالتصنيف: ${c.classification}\nالنص المستخرج الموثق:\n${c.text}`
      )
      .join("\n\n");

    const systemInstruction = `أنت محرر علمي وباحث متخصص حصراً في التراث الإسلامي الشيعي الإثني عشري وإعداد أسئلة المسابقات الثقافية التلفزيونية الرصينة.
قواعد صارمة لا تقبل الاستثناء:
1. اعتمد حصراً وبشكل مطلق على "النصوص المستخرجة الموثقة" من المصادر الشيعية المعتمدة المرفقة أدناه فقط.
2. يُمنع منعاً باتاً الاعتماد على الذاكرة العامة أو مواقع غير شيعية أو منتديات أو أي معلومة غير واردة نصياً في المصادر المرفقة.
3. يُمنع منعاً باتاً اختلاق الأحاديث أو الروايات أو خلط روايتين أو استنتاج حكم أو واقعة غير مصرح بها في النص.
4. إذا لم يكفِ النص المرفق لتوليد العدد المطلوب من الأسئلة الموثقة بدقة، فأخرج فقط الأسئلة التي يثبتها النص، واضبط insufficientSource: true مع ذكر السبب في insufficientReason.
5. إذا تضمنت المعلومة رواية ضعيفة أو مسألة خلافية بين الفقهاء/المؤرخين، اضبط needsManualVerification: true واكتب تنبيهاً في verificationNote.
6. التدرج الموضوعي في الصعوبة:
   - easy: حقيقة واضحة ومباشرة من النص.
   - medium: ربط تفصيل أو سياق متوسط الدقة.
   - hard: تفصيل علمي أو تاريخي أو عقدي/فقهي دقيق.
   - expert: مسألة معمقة أو نص دقيق من المتن.
7. أدرج مع كل سؤال: sourceName و sourceUrl (مطابقين تماماً لأحد المصادر المرفقة)، volumePageOrHadith (إن وجد في النص أو اسم الباب/الموضوع)، و originalExcerpt (مقتبس حرفي دقيق من النص المرفق يثبت الإجابة).`;

    const prompt = `المطلوب توليد ${clampedCount} سؤالاً ثقافياً لقسم: "${categoryName}"${categoryDescription ? ` (${categoryDescription})` : ""}.
مستوى الصعوبة المطلوب: ${difficulty}.
أنماط الأسئلة المسموحة: ${Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes.join("، ") : "multiple_choice"}.
${letter ? `شرط الحرف: يجب أن تبدأ الإجابة بحرف (${letter}).` : ""}
${existingQuestions.length > 0 ? `\nأسئلة موجودة مسبقاً (يمنع تكرارها أو التشابه معها):\n- ${existingQuestions.slice(-80).join("\n- ")}` : ""}

المصادر الشيعية المعتمدة المسموح الاستناد إليها فقط:
${sourcesBundleText}`;

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                insufficientSource: { type: Type.BOOLEAN },
                insufficientReason: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      questionType: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      difficulty: { type: Type.STRING },
                      sourceName: { type: Type.STRING },
                      sourceUrl: { type: Type.STRING },
                      volumePageOrHadith: { type: Type.STRING },
                      originalExcerpt: { type: Type.STRING },
                      hint: { type: Type.STRING },
                      needsManualVerification: { type: Type.BOOLEAN },
                      verificationNote: { type: Type.STRING },
                    },
                    required: [
                      "text",
                      "questionType",
                      "answer",
                      "difficulty",
                      "sourceName",
                      "sourceUrl",
                      "originalExcerpt",
                    ],
                  },
                },
              },
              required: ["insufficientSource", "questions"],
            },
          },
        })
      );

      const parsed = safeJsonParse(response.text || "{}");
      if (!parsed || !Array.isArray(parsed.questions)) {
        return res.status(502).json({ error: "تعذر قراءة مخرجات الذكاء الاصطناعي بصيغة صحيحة." });
      }

      const existingSet = new Set(existingQuestions.map((q: string) => String(q).trim().toLowerCase()));
      const validQuestions: any[] = [];

      for (const rawQ of parsed.questions) {
        const text = String(rawQ.text || "").trim();
        const answer = String(rawQ.answer || "").trim();
        const excerpt = String(rawQ.originalExcerpt || "").trim();
        const srcUrl = String(rawQ.sourceUrl || "").trim();
        const srcName = String(rawQ.sourceName || "").trim();

        if (!text || !answer || excerpt.length < 15) continue;
        if (existingSet.has(text.toLowerCase())) continue;

        // Enforce strict whitelist match on source
        const matchedSource = corpusParts.find(
          (c) =>
            (srcUrl && c.url.trim().toLowerCase() === srcUrl.toLowerCase()) ||
            c.name.trim().toLowerCase() === srcName.toLowerCase()
        );
        if (!matchedSource && allowedSourceUrls.size > 0 && !allowedSourceNames.has(srcName.toLowerCase())) {
          continue;
        }

        const finalSource = matchedSource || corpusParts[0];
        const diff = ["easy", "medium", "hard", "expert"].includes(rawQ.difficulty) ? rawQ.difficulty : difficulty;
        const qType = rawQ.questionType || "multiple_choice";

        let cleanOptions: string[] | undefined = undefined;
        if (qType === "true_false") {
          cleanOptions = ["صح", "خطأ"];
        } else if (Array.isArray(rawQ.options) && rawQ.options.length >= 2) {
          const opts: string[] = Array.from(
            new Set<string>(rawQ.options.map((o: any) => String(o).trim()).filter(Boolean))
          );
          if (!opts.includes(answer)) {
            opts.unshift(answer);
          }
          cleanOptions = opts.slice(0, 4).sort(() => 0.5 - Math.random());
        }

        const needsManual = Boolean(rawQ.needsManualVerification);
        const reviewStatus = autoApproveVerifiedAI && !needsManual ? "approved" : "pending";

        existingSet.add(text.toLowerCase());
        validQuestions.push({
          text,
          questionType: qType,
          answer,
          options: cleanOptions,
          difficulty: diff,
          points: pointByDiff[diff] || 40,
          source: finalSource.name,
          sourceName: finalSource.name,
          sourceUrl: finalSource.url,
          sourceId: finalSource.id,
          volumePageOrHadith: String(rawQ.volumePageOrHadith || "").trim() || "مراجعة المرجع المعتمد",
          originalExcerpt: excerpt,
          hint: String(rawQ.hint || "").trim(),
          needsManualVerification: needsManual,
          verificationNote: String(rawQ.verificationNote || "").trim(),
          reviewStatus,
        });
      }

      if (validQuestions.length === 0) {
        return res.json({
          insufficientSource: true,
          message:
            parsed.insufficientReason ||
            "النصوص المتوفرة في المصدر المعتمد غير كافية لصياغة أسئلة جديدة مطابقة للشروط دون تكرار.",
          questions: [],
        });
      }

      return res.json({
        insufficientSource: Boolean(parsed.insufficientSource),
        message: parsed.insufficientReason || "",
        questions: validQuestions,
      });
    } catch (err: any) {
      console.error("[AI GENERATE] error:", err);
      const status = isRetryableGeminiError(err)
        ? String(err?.message || "").includes("429")
          ? 429
          : 503
        : 500;
      return res.status(status).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  app.post("/api/ai/generate-options", requireAdminAuth, async (req, res) => {
    const ai = getAiClient();
    const { question, answer, otherAnswers = [] } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ error: "السؤال والإجابة مطلوبان." });
    }

    if (!ai) {
      const pool = Array.from(new Set(otherAnswers.filter((a: string) => a && a !== answer))).slice(0, 2);
      return res.json({ options: [answer, ...pool].sort(() => 0.5 - Math.random()) });
    }

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `أنت محرر مسابقات ثقافية إسلامية رصينة. للسؤال التالي وإجابته الصحيحة، أنشئ خيارين خاطئين منطقيين ومتقاربين في السياق الثقافي/الشيعي باللغة العربية الفصحى، ثم أعد مصفوفة JSON مكونة من 3 نصوص (الإجابة الصحيحة + الخياران الخاطئان).\nالسؤال: "${question}"\nالإجابة الصحيحة: "${answer}"`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        })
      );
      const parsed = safeJsonParse(response.text || "[]");
      const list = Array.isArray(parsed) ? parsed.map(String) : [];
      if (!list.includes(answer)) list.unshift(answer);
      const unique = Array.from(new Set(list)).slice(0, 3);
      return res.json({ options: unique.sort(() => 0.5 - Math.random()) });
    } catch (err: any) {
      return res.status(500).json({ error: formatGeminiErrorMessage(err) || "تعذر توليد الخيارات." });
    }
  });

  app.post("/api/ai/generate-hint", hintRateLimit, async (req, res) => {
    const ai = getAiClient();
    const { question, answer, sourceExcerpt } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ error: "السؤال والإجابة مطلوبان." });
    }
    if (!ai) {
      return res.json({ hint: "تأمل في سياق السؤال والشخصيات المرتبطة به." });
    }

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `أنشئ تلميحاً عربياً موجزاً (سطر واحد، أقل من 15 كلمة) يساعد المتسابق على تذكر الإجابة دون ذكر الإجابة أو جذرها صراحة.\nالسؤال: "${question}"\nالإجابة: "${answer}"${sourceExcerpt ? `\nالمقتبس المعتمد: "${sourceExcerpt}"` : ""}`,
        })
      );
      return res.json({ hint: (response.text || "").trim() || "استحضر السياق التاريخي والمصدر المعتمد للسؤال." });
    } catch (err: any) {
      return res.status(500).json({ error: formatGeminiErrorMessage(err) || "تعذر توليد التلميح." });
    }
  });

  app.post("/api/ai/rephrase", requireAdminAuth, async (req, res) => {
    const ai = getAiClient();
    const { text, type = "question" } = req.body || {};
    if (!text) return res.status(400).json({ error: "النص مطلوب." });
    if (!ai) return res.json({ text });

    try {
      const prompt =
        type === "question"
          ? `أعد صياغة هذا السؤال بأسلوب عربي فصيح واضح وجذاب لمسابقة ثقافية تلفزيونية مع الحفاظ التام على المعنى العلمي والمصدرية دون زيادة أو تحريف:\n"${text}"`
          : `أعد صياغة هذه الإجابة بعبارة علمية عربية دقيقة وموجزة:\n"${text}"`;
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
        })
      );
      return res.json({ text: (response.text || "").trim() || text });
    } catch (err: any) {
      return res.status(500).json({ error: formatGeminiErrorMessage(err) || "تعذر إعادة الصياغة." });
    }
  });

  app.post("/api/ai/parse-bulk", requireAdminAuth, async (req, res) => {
    const ai = getAiClient();
    const { rawText, sourceName, sourceUrl, defaultDifficulty = "medium" } = req.body || {};
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ error: "يرجى لصق النص المراد استخراج الأسئلة منه." });
    }
    if (!ai) {
      return res.status(503).json({ error: "مفتاح GEMINI_API_KEY غير مضبوط على الخادم." });
    }

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `استخرج الأسئلة والأجوبة من النص المرفق كما وردت دون اختلاق أي معلومة خارج النص.\nاسم المصدر: ${sourceName || "إدخال إداري موثق"}\nالرابط: ${sourceUrl || ""}\nالمستوى الافتراضي: ${defaultDifficulty}\nالنص:\n${rawText.substring(0, 20000)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  questionType: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  originalExcerpt: { type: Type.STRING },
                },
                required: ["text", "answer"],
              },
            },
          },
        })
      );
      const parsed = safeJsonParse(response.text || "[]");
      return res.json({ questions: Array.isArray(parsed) ? parsed : [] });
    } catch (err: any) {
      return res.status(500).json({ error: formatGeminiErrorMessage(err) || "فشل تحليل النص المجمع." });
    }
  });

  // =========================================================================
  // INTELLIGENT VIDEO UPLOAD, BYTE-RANGE STREAMING, AI CLIPPING & FFMPEG EXPORT
  // =========================================================================

  app.post(
    "/api/video/upload",
    requireAdminAuth,
    express.raw({ type: ["video/*", "audio/*", "application/octet-stream"], limit: "150mb" }),
    async (req, res) => {
      try {
        const buf = req.body as Buffer;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
          return res.status(400).json({ error: "ملف الفيديو فارغ أو غير صالح." });
        }

        const rawName = String(req.headers["x-file-name"] || "video.mp4");
        const safeExt = path.extname(rawName).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".mp4";
        const allowedExt = [".mp4", ".webm", ".mov", ".m4v", ".mp3", ".wav", ".m4a", ".ogg"].includes(safeExt)
          ? safeExt
          : ".mp4";
        const fileId = `vid_${Date.now()}_${crypto.randomBytes(5).toString("hex")}${allowedExt}`;
        const destPath = path.join(VIDEO_CACHE_DIR, fileId);
        fs.writeFileSync(destPath, buf);

        const probe = await probeMediaMetadata(destPath);
        return res.json({
          fileId,
          streamUrl: `/api/video/stream/${fileId}`,
          totalDuration: probe.duration,
          hasAudio: probe.hasAudio,
          fileSize: buf.length,
        });
      } catch (err: any) {
        console.error("[VIDEO UPLOAD] error:", err);
        return res.status(500).json({ error: err?.message || "تعذر رفع ملف الفيديو." });
      }
    }
  );

  const serveRangeMedia = (baseDir: string) => (req: express.Request, res: express.Response) => {
    const fileId = String(req.params.fileId || "");
    if (!/^[a-zA-Z0-9._-]+$/.test(fileId)) {
      return res.status(400).json({ error: "Invalid file identifier" });
    }
    const filePath = path.join(baseDir, fileId);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Media file not found" });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const ext = path.extname(fileId).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".mp4": "video/mp4",
      ".m4v": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
    };
    const contentType = mimeMap[ext] || "video/mp4";
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 2 * 1024 * 1024 - 1, totalSize - 1);
      const end = Math.min(requestedEnd, totalSize - 1);
      if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
        return res.status(416).set({ "Content-Range": `bytes */${totalSize}` }).end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  };

  app.get("/api/video/stream/:fileId", serveRangeMedia(VIDEO_CACHE_DIR));
  app.get("/api/video/clip-file/:fileId", serveRangeMedia(CLIP_CACHE_DIR));

  app.post("/api/video/inspect", requireAdminAuth, async (req, res) => {
    try {
      const rawUrl = String(req.body?.videoUrl || "").trim();
      const streamUrl = String(req.body?.streamUrl || "").trim();
      if (!rawUrl && !streamUrl) {
        return res.status(400).json({ error: "يرجى إدخال رابط الفيديو أو رفعه أولاً." });
      }
      if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
        const safeCheck = await assertSafePublicUrl(rawUrl);
        if (!safeCheck.ok) {
          return res.status(400).json({ error: safeCheck.message });
        }
      }

      const ytId = rawUrl ? extractYouTubeId(rawUrl) : null;
      if (ytId) {
        const yt = await fetchYouTubeMetadataAndCaptions(rawUrl);
        return res.json({
          sourceType: "youtube",
          title: yt.title,
          thumbnailUrl: yt.thumbnailUrl,
          totalDuration: yt.totalDuration,
          transcriptSegments: yt.transcriptSegments,
          fullTranscript: yt.transcriptSegments.map((s) => s.text).join(" "),
          restrictsDirectDownload: true,
          status: yt.transcriptSegments.length > 0 ? "ready" : "restricted",
          message: yt.message,
        });
      }

      const targetInput = resolveLocalVideoInput(streamUrl || rawUrl);
      const probe = await probeMediaMetadata(targetInput);
      return res.json({
        sourceType: streamUrl.startsWith("/api/video/stream/") ? "uploaded_file" : "direct_video",
        title: path.basename(rawUrl || streamUrl).split("?")[0] || "فيديو مباشر موثق",
        thumbnailUrl: "",
        totalDuration: probe.duration,
        transcriptSegments: [],
        fullTranscript: "",
        restrictsDirectDownload: false,
        status: probe.duration > 0 ? "ready" : "idle",
        message:
          probe.duration > 0
            ? `تم فحص الفيديو بنجاح (المدة: ${formatSecToMMSS(probe.duration)}). جاهز للتحليل الذكي.`
            : "تم حفظ الرابط المباشر. قد يتطلب استخراج النص خطوة التحليل الصوتي.",
      });
    } catch (err: any) {
      return res.status(422).json({ error: err?.message || "تعذر قراءة بيانات الفيديو." });
    }
  });

  app.post("/api/video/export-clip", requireAdminAuth, async (req, res) => {
    try {
      const { videoUrl, streamUrl, startTime, endTime, restrictsDirectDownload } = req.body || {};
      const start = Math.max(0, Number(startTime) || 0);
      const end = Math.max(start + 1, Number(endTime) || start + 15);
      const sourceStr = String(streamUrl || videoUrl || "").trim();

      if (!sourceStr) {
        return res.status(400).json({ error: "مصدر الفيديو غير محدد." });
      }
      if (/^https?:\/\//i.test(sourceStr)) {
        const safeCheck = await assertSafePublicUrl(sourceStr);
        if (!safeCheck.ok) {
          return res.status(400).json({ error: safeCheck.message });
        }
      }
      if (restrictsDirectDownload || extractYouTubeId(sourceStr)) {
        return res.status(422).json({
          error:
            "المصدر يفرض قيوداً على التنزيل المباشر (مثل YouTube). يعتمد النظام تلقائياً على الاقتطاع المنطقي الزمني أثناء العرض دون تجاوز سياسات المصدر.",
        });
      }

      const resolvedInput = resolveLocalVideoInput(sourceStr);
      const hash = crypto
        .createHash("sha256")
        .update(`${resolvedInput}:${start.toFixed(2)}:${end.toFixed(2)}`)
        .digest("hex")
        .slice(0, 16);
      const clipFile = `clip_${hash}.mp4`;
      const outPath = path.join(CLIP_CACHE_DIR, clipFile);

      if (!fs.existsSync(outPath)) {
        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-ss",
            String(start),
            "-to",
            String(end),
            "-i",
            resolvedInput,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            outPath,
          ],
          { timeout: 120000 }
        );
      }

      return res.json({
        cachedClipUrl: `/api/video/clip-file/${clipFile}`,
        duration: Math.round(end - start),
        message: "تم تصدير المقطع المقتطع وتخزينه مؤقتاً مع الحفاظ الكامل على الفيديو الأصلي.",
      });
    } catch (err: any) {
      console.error("[EXPORT CLIP] error:", err);
      return res.status(500).json({ error: err?.message || "تعذر تصدير مقطع الفيديو عبر FFmpeg." });
    }
  });

  app.get("/api/video/jobs/:jobId", requireAdminAuth, (req, res) => {
    const job = videoJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "المهمة غير موجودة أو انتهت صلاحيتها." });
    }
    return res.json(job);
  });

  app.post("/api/video/analyze", requireAdminAuth, async (req, res) => {
    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: "مفتاح GEMINI_API_KEY غير مضبوط على الخادم.",
      });
    }

    const {
      mode = "match_question",
      videoUrl = "",
      streamUrl = "",
      videoTitle = "",
      totalDuration = 0,
      transcriptSegments = [],
      manualTranscript = "",
      approvedSource,
      questionText = "",
      answerText = "",
      categoryName = "",
      count = 3,
      difficulty = "medium",
      scoringSettings,
    } = req.body || {};

    if (mode === "generate_from_video" && (!approvedSource || approvedSource.isApproved !== true)) {
      return res.status(403).json({
        error: "يمنع توليد أسئلة بالذكاء الاصطناعي من فيديو غير مرتبط بمصدر شيعي معتمد ومفعل.",
      });
    }

    if (mode === "match_question" && (!questionText.trim() || !answerText.trim())) {
      return res.status(400).json({
        error: "يجب تحديد نص السؤال والإجابة الصحيحة لمطابقة المشهد المثبت لها.",
      });
    }

    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const job: VideoJobState = {
      jobId,
      status: "queued",
      progress: 5,
      stepLabel: "تم استلام طلب تحليل الفيديو...",
      createdAt: Date.now(),
    };
    videoJobs.set(jobId, job);

    res.json({ jobId });

    // Background async video analysis worker
    setImmediate(async () => {
      const updateJob = (patch: Partial<VideoJobState>) => {
        const cur = videoJobs.get(jobId);
        if (cur) Object.assign(cur, patch);
      };

      try {
        updateJob({ status: "processing", progress: 15, stepLabel: "جلب بيانات الفيديو والتحقق من المصدر..." });

        let resolvedTitle = String(videoTitle || "").trim();
        let resolvedDuration = Number(totalDuration) || 0;
        let resolvedSegments: VideoTranscriptSeg[] = Array.isArray(transcriptSegments) ? transcriptSegments : [];
        let restrictsDirectDownload = false;
        const ytId = videoUrl ? extractYouTubeId(videoUrl) : null;

        if (ytId) {
          restrictsDirectDownload = true;
          if (resolvedSegments.length === 0) {
            const yt = await fetchYouTubeMetadataAndCaptions(videoUrl);
            if (!resolvedTitle) resolvedTitle = yt.title;
            if (!resolvedDuration) resolvedDuration = yt.totalDuration;
            resolvedSegments = yt.transcriptSegments;
          }
        } else if ((streamUrl || videoUrl) && resolvedSegments.length === 0 && !manualTranscript.trim()) {
          const mediaInput = resolveLocalVideoInput(streamUrl || videoUrl);
          if (!resolvedDuration) {
            const probe = await probeMediaMetadata(mediaInput);
            resolvedDuration = probe.duration;
          }
          resolvedSegments = await transcribeDirectMediaWithGemini(ai, mediaInput, resolvedDuration, (pct, lbl) => {
            updateJob({ progress: pct, stepLabel: lbl });
          });
        }

        if (manualTranscript.trim() && resolvedSegments.length === 0) {
          resolvedSegments = parseTimestampedTranscriptLines(
            manualTranscript,
            0,
            resolvedDuration > 0 ? resolvedDuration : 600
          );
        }

        if (resolvedSegments.length === 0) {
          updateJob({
            status: "failed",
            progress: 100,
            stepLabel: "تعذر استخراج نص منطوق تلقائياً من هذا المصدر.",
            error: ytId
              ? "فيديو YouTube لا يحتوي على ترجمة نصية متاحة للتحليل الآلي ويمنع التحميل المباشر. يرجى لصق نص التفريغ في خانة (النص المفرغ) أو استخدام ملف فيديو/صوت مباشر."
              : "تعذر استخراج الصوت أو النص من رابط الفيديو. تحقق من صحة الرابط المباشر أو ارفع ملف الفيديو.",
          });
          return;
        }

        if (resolvedDuration === 0) {
          resolvedDuration = Math.ceil(resolvedSegments[resolvedSegments.length - 1].end);
        }

        const fullTranscript = resolvedSegments.map((s) => s.text).join(" ");
        const compactTimedTranscript = buildCompactTimestampedTranscript(resolvedSegments, 32000);

        if (mode === "transcribe_only") {
          updateJob({
            status: "completed",
            progress: 100,
            stepLabel: "تم تفريغ الصوت إلى نص زمني بنجاح.",
            result: {
              title: resolvedTitle || "فيديو موثق",
              totalDuration: resolvedDuration,
              transcriptSegments: resolvedSegments,
              fullTranscript,
              restrictsDirectDownload,
            },
          });
          return;
        }

        updateJob({
          progress: 72,
          stepLabel:
            mode === "match_question"
              ? "تحليل النص بالذكاء الاصطناعي وتحديد المشهد الذي يثبت الإجابة بدقة..."
              : "توليد أسئلة موثقة وربط كل سؤال بمقطعه الزمني...",
        });

        if (mode === "match_question") {
          const matchPrompt = `أنت خبير مونتاج وتحقق معرفي لبرامج المسابقات التلفزيونية الرصينة (مسابقة ابوالفواطم).
مهمتك: تحليل النص الزمني للفيديو أدناه وتحديد المقطع أو المقاطع المحددة التي تحتوي فعلياً على المعلومة التي **تثبت وتبرهن** الإجابة الصحيحة للسؤال.

قواعد صارمة لا تقبل التهاون:
1. يُمنع منعاً باتاً اختيار مقطع لمجرد تشابه الكلمات أو ذكر الموضوع بشكل عابر دون إثبات الإجابة!
2. تأكد أن المقطع يحتوي فعلياً على المعلومة التي تثبت الإجابة: "${answerText}".
3. يجب أن يكون الاقتطاع ديناميكياً وفق طول الفكرة والكلام، وليس مدة ثابتة.
4. لا تقتطع بداية الجملة ولا تبتر نهاية الإجابة؛ اجعل startTime يبدأ من بداية الجملة التمهيدية قبل المعلومة و endTime ينتهي عند تمام اكتمال الفكرة والإجابة.
5. إذا كانت الإجابة موزعة في موضعين مختلفين داخل الفيديو، أعد مقطعين (أو أكثر) في مصفوفة clips.
6. إذا لم يثبت الفيديو الإجابة بوضوح أو كانت الدقة ضعيفة (< 75%)، فاضبط provesAnswer: false و confidence منخفضة (أقل من 60) واذكر ذلك بصراحة في verificationNote.

معلومات السؤال المستهدف:
- السؤال: ${questionText}
- الإجابة الصحيحة المطلوب إثباتها من الفيديو: ${answerText}
- مدة الفيديو الإجمالية: ${resolvedDuration} ثانية (${formatSecToMMSS(resolvedDuration)})

النص المفرغ مع التوقيتات الزمنية [MM:SS - MM:SS]:
${compactTimedTranscript}`;

          const resp = await callGeminiWithRetry(
            () =>
              ai.models.generateContent({
                model: "gemini-4-hydrogen",
                contents: matchPrompt,
                config: {
                  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      overallConfidence: { type: Type.NUMBER },
                      needsManualVerification: { type: Type.BOOLEAN },
                      verificationNote: { type: Type.STRING },
                      clips: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            startTimeSeconds: { type: Type.NUMBER },
                            endTimeSeconds: { type: Type.NUMBER },
                            transcriptExcerpt: { type: Type.STRING },
                            sceneDescription: { type: Type.STRING },
                            confidence: { type: Type.NUMBER },
                            provesAnswer: { type: Type.BOOLEAN },
                          },
                          required: [
                            "startTimeSeconds",
                            "endTimeSeconds",
                            "transcriptExcerpt",
                            "sceneDescription",
                            "confidence",
                            "provesAnswer",
                          ],
                        },
                      },
                    },
                    required: ["overallConfidence", "needsManualVerification", "clips"],
                  },
                },
              }),
            {
              maxRetries: 3,
              onRetry: (attempt) => {
                updateJob({
                  progress: 72,
                  stepLabel: `خادم الذكاء الاصطناعي مزدحم مؤقتاً، إعادة التحليل تلقائياً (${attempt}/3)...`,
                });
              },
            }
          );

          const parsed = safeJsonParse(resp.text || "{}") || {};
          const rawClips = Array.isArray(parsed.clips) ? parsed.clips : [];

          updateJob({ progress: 92, stepLabel: "ضبط الهوامش الزمنية للكلام وتجهيز المعاينة..." });

          const normalizedClips = rawClips.map((c: any, idx: number) => {
            const bounded = clampClipWithNaturalBounds(
              c.startTimeSeconds,
              c.endTimeSeconds,
              resolvedDuration,
              resolvedSegments
            );
            const conf = Math.min(100, Math.max(0, Math.round(Number(c.confidence) || 0)));
            return {
              id: `clip_${Date.now()}_${idx}`,
              label: String(c.label || "").trim() || (rawClips.length > 1 ? `المشهد ${idx + 1}` : "المشهد المثبت للإجابة"),
              startTime: bounded.startTime,
              endTime: bounded.endTime,
              duration: bounded.duration,
              transcriptExcerpt: String(c.transcriptExcerpt || "").trim(),
              sceneDescription: String(c.sceneDescription || "").trim(),
              confidence: conf,
              provesAnswer: Boolean(c.provesAnswer) && conf >= 50,
              isApproved: false,
            };
          });

          const overallConf = Math.min(
            100,
            Math.max(
              0,
              Math.round(Number(parsed.overallConfidence) || normalizedClips[0]?.confidence || 0)
            )
          );
          const needsManual =
            Boolean(parsed.needsManualVerification) ||
            overallConf < 75 ||
            normalizedClips.length === 0 ||
            normalizedClips.every((c: any) => !c.provesAnswer);

          updateJob({
            status: "completed",
            progress: 100,
            stepLabel: "اكتمل التحليل وتحديد المشاهد بنجاح.",
            result: {
              title: resolvedTitle,
              totalDuration: resolvedDuration,
              transcriptSegments: resolvedSegments,
              fullTranscript,
              restrictsDirectDownload,
              overallConfidence: overallConf,
              needsManualVerification: needsManual,
              verificationNote:
                String(parsed.verificationNote || "").trim() ||
                (needsManual ? "مستوى الثقة منخفض أو المعلومة جزئية؛ يرجى مراجعة المشهد وتعديل التوقيت يدوياً قبل الاعتماد." : ""),
              clips: normalizedClips,
            },
          });
          return;
        }

        // mode === 'generate_from_video'
        const clampedCount = Math.min(Math.max(Number(count) || 3, 1), 10);
        const pointByDiff: Record<string, number> = {
          easy: Number(scoringSettings?.easyPoints) || 20,
          medium: Number(scoringSettings?.mediumPoints) || 40,
          hard: Number(scoringSettings?.hardPoints) || 60,
          expert: Number(scoringSettings?.expertPoints) || 80,
        };

        const genPrompt = `أنت محرر علمي لمسابقة ثقافية تلفزيونية شيعية موثقة (${categoryName || "ثقافة إسلامية"}).
اعتمد حصراً على التفريغ الزمني للفيديو المعتمد أدناه لتوليد ${clampedCount} أسئلة وأجوبة دقيقة.
لكل سؤال:
- يجب أن تكون الإجابة مثبتة صراحةً في كلام المتحدث داخل الفيديو.
- حدد المقطع الزمني الدقيق (startTimeSeconds, endTimeSeconds) الذي يثبت الإجابة دون بتر بداية أو نهاية الجملة، وبمدة ديناميكية تناسب المعلومة.
- أدرج transcriptExcerpt (الكلام المقتبس)، sceneDescription (وصف مختصر للمشهد)، و confidence (0..100).

المصدر المعتمد: ${approvedSource.name} (${approvedSource.url || ""})
عنوان الفيديو: ${resolvedTitle || "فيديو معتمد"}
المدة الإجمالية: ${resolvedDuration} ثانية

التفريغ الزمني للفيديو:
${compactTimedTranscript}`;

        const resp = await callGeminiWithRetry(
          () =>
            ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents: genPrompt,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          answer: { type: Type.STRING },
                          questionType: { type: Type.STRING },
                          difficulty: { type: Type.STRING },
                          options: { type: Type.ARRAY, items: { type: Type.STRING } },
                          hint: { type: Type.STRING },
                          startTimeSeconds: { type: Type.NUMBER },
                          endTimeSeconds: { type: Type.NUMBER },
                          transcriptExcerpt: { type: Type.STRING },
                          sceneDescription: { type: Type.STRING },
                          confidence: { type: Type.NUMBER },
                          provesAnswer: { type: Type.BOOLEAN },
                        },
                        required: [
                          "text",
                          "answer",
                          "startTimeSeconds",
                          "endTimeSeconds",
                          "transcriptExcerpt",
                          "sceneDescription",
                          "confidence",
                          "provesAnswer",
                        ],
                      },
                    },
                  },
                  required: ["questions"],
                },
              },
            }),
          {
            maxRetries: 3,
            onRetry: (attempt) => {
              updateJob({
                progress: 72,
                stepLabel: `خادم الذكاء الاصطناعي مزدحم مؤقتاً، إعادة توليد الأسئلة تلقائياً (${attempt}/3)...`,
              });
            },
          }
        );

        const parsed = safeJsonParse(resp.text || "{}") || {};
        const generated = (Array.isArray(parsed.questions) ? parsed.questions : []).map((rawQ: any, i: number) => {
          const bounded = clampClipWithNaturalBounds(
            rawQ.startTimeSeconds,
            rawQ.endTimeSeconds,
            resolvedDuration,
            resolvedSegments
          );
          const conf = Math.min(100, Math.max(0, Math.round(Number(rawQ.confidence) || 0)));
          const diff = ["easy", "medium", "hard", "expert"].includes(rawQ.difficulty) ? rawQ.difficulty : difficulty;
          return {
            text: String(rawQ.text || "").trim(),
            answer: String(rawQ.answer || "").trim(),
            questionType: rawQ.questionType || "multiple_choice",
            difficulty: diff,
            points: pointByDiff[diff] || 40,
            options: Array.isArray(rawQ.options) ? rawQ.options.slice(0, 4) : undefined,
            hint: String(rawQ.hint || "").trim(),
            sourceName: approvedSource.name,
            source: approvedSource.name,
            sourceUrl: approvedSource.url || videoUrl,
            sourceId: approvedSource.id || "",
            originalExcerpt: String(rawQ.transcriptExcerpt || "").trim(),
            confidenceScore: conf,
            needsManualVerification: conf < 75 || !rawQ.provesAnswer,
            reviewStatus: "pending",
            clipApproved: false,
            videoClips: [
              {
                id: `clip_${Date.now()}_${i}`,
                label: "المشهد المثبت للإجابة",
                startTime: bounded.startTime,
                endTime: bounded.endTime,
                duration: bounded.duration,
                transcriptExcerpt: String(rawQ.transcriptExcerpt || "").trim(),
                sceneDescription: String(rawQ.sceneDescription || "").trim(),
                confidence: conf,
                provesAnswer: Boolean(rawQ.provesAnswer),
                isApproved: false,
              },
            ],
          };
        });

        updateJob({
          status: "completed",
          progress: 100,
          stepLabel: `تم توليد ${generated.length} أسئلة مرتبطة بمقاطعها الزمنية.`,
          result: {
            title: resolvedTitle,
            totalDuration: resolvedDuration,
            transcriptSegments: resolvedSegments,
            fullTranscript,
            restrictsDirectDownload,
            questions: generated,
          },
        });
      } catch (err: any) {
        console.error("[VIDEO ANALYZE JOB] error:", err);
        updateJob({
          status: "failed",
          progress: 100,
          stepLabel: "تعذر إكمال تحليل الفيديو.",
          error: formatGeminiErrorMessage(err),
        });
      }
    });
  });

  // Dynamic Web App Manifest & PWA Icon Endpoints (reads live settings from Firestore REST API)
  const PWA_ICON_CACHE_DIR = path.join(os.tmpdir(), "abf_pwa_icons");
  if (!fs.existsSync(PWA_ICON_CACHE_DIR)) {
    fs.mkdirSync(PWA_ICON_CACHE_DIR, { recursive: true });
  }

  let liveBrandingCache: {
    fetchedAt: number;
    data: {
      competitionName: string;
      competitionSlogan: string;
      logoUrl: string;
      logoUpdatedAt: number;
    };
  } | null = null;

  async function fetchLivePwaBranding() {
    const now = Date.now();
    if (liveBrandingCache && now - liveBrandingCache.fetchedAt < 10_000) {
      return liveBrandingCache.data;
    }
    const fallback = {
      competitionName: "مسابقة ابوالفواطم",
      competitionSlogan: "منصة مسابقات ثقافية تفاعلية بنظام الفرق والجولات",
      logoUrl: "",
      logoUpdatedAt: 1,
    };

    try {
      const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (!fs.existsSync(cfgPath)) return fallback;
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      const projectId = cfg?.projectId;
      const databaseId = cfg?.firestoreDatabaseId || "(default)";
      if (!projectId) return fallback;

      const restUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/${encodeURIComponent(databaseId)}/documents/settings`;
      const resp = await axios.get(restUrl, { timeout: 4500 });
      const docs = Array.isArray(resp.data?.documents) ? resp.data.documents : [];
      const fields = docs[0]?.fields || {};
      const logoUrl = String(fields.logoUrl?.stringValue || "").trim();
      const logoUpdatedAt = Number(
        fields.logoUpdatedAt?.integerValue || fields.logoUpdatedAt?.doubleValue || 1
      );
      const data = {
        competitionName: String(fields.competitionName?.stringValue || fallback.competitionName).trim(),
        competitionSlogan: String(fields.competitionSlogan?.stringValue || fallback.competitionSlogan).trim(),
        logoUrl:
          logoUrl && !logoUrl.includes("flaticon.com") && !logoUrl.includes("icons8.com")
            ? logoUrl
            : "",
        logoUpdatedAt: Number.isFinite(logoUpdatedAt) && logoUpdatedAt > 0 ? logoUpdatedAt : 1,
      };
      liveBrandingCache = { fetchedAt: now, data };
      return data;
    } catch {
      return liveBrandingCache?.data || fallback;
    }
  }

  function appendServerVersionParam(rawUrl: string, version: number): string {
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return rawUrl;
    try {
      const parsed = new URL(rawUrl, "https://placeholder.local");
      parsed.searchParams.set("v", String(version));
      return rawUrl.startsWith("/") ? `${parsed.pathname}${parsed.search}` : parsed.toString();
    } catch {
      return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}v=${version}`;
    }
  }

  function getStaticPublicIconPath(variant: string): string {
    const fileName =
      variant === "192"
        ? "pwa-192x192.png"
        : variant === "maskable-512"
          ? "pwa-maskable-512x512.png"
          : variant === "apple-touch-icon"
            ? "apple-touch-icon.png"
            : "pwa-512x512.png";
    const distFile = path.join(process.cwd(), "dist", fileName);
    if (fs.existsSync(distFile)) return distFile;
    return path.join(process.cwd(), "public", fileName);
  }

  app.get("/api/pwa-icon/:variant.png", async (req, res) => {
    const rawVariant = String(req.params.variant || "512");
    const variant = ["192", "512", "maskable-512", "apple-touch-icon"].includes(rawVariant)
      ? rawVariant
      : "512";

    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.setHeader("Content-Type", "image/png");

    try {
      const branding = await fetchLivePwaBranding();
      if (branding.logoUrl && branding.logoUrl.startsWith("data:image/")) {
        const match = branding.logoUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          const ext = match[1] === "jpeg" ? "jpg" : match[1].replace(/[^a-z0-9]/gi, "") || "png";
          const buf = Buffer.from(match[2], "base64");
          const hash = crypto
            .createHash("sha256")
            .update(buf)
            .update(`:${variant}`)
            .digest("hex")
            .slice(0, 16);
          const outPath = path.join(PWA_ICON_CACHE_DIR, `icon_${variant}_${hash}.png`);
          if (!fs.existsSync(outPath)) {
            const tmpIn = path.join(PWA_ICON_CACHE_DIR, `src_${hash}.${ext}`);
            fs.writeFileSync(tmpIn, buf);
            const vf =
              variant === "192"
                ? "scale=192:192:force_original_aspect_ratio=increase,crop=192:192"
                : variant === "apple-touch-icon"
                  ? "scale=180:180:force_original_aspect_ratio=increase,crop=180:180"
                  : variant === "maskable-512"
                    ? "scale=390:390:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#0B192C"
                    : "scale=512:512:force_original_aspect_ratio=increase,crop=512:512";
            try {
              await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmpIn, "-vf", vf, outPath], {
                timeout: 15_000,
              });
            } finally {
              try {
                fs.unlinkSync(tmpIn);
              } catch {}
            }
          }
          if (fs.existsSync(outPath)) {
            return res.sendFile(outPath);
          }
        }
      }
    } catch (err: any) {
      console.warn("[PWA ICON] Fallback to static icon:", err?.message || err);
    }

    const fallbackPath = getStaticPublicIconPath(variant);
    if (fs.existsSync(fallbackPath)) {
      return res.sendFile(fallbackPath);
    }
    return res.status(404).end();
  });

  const serveDynamicManifest = async (_req: express.Request, res: express.Response) => {
    const branding = await fetchLivePwaBranding();
    const version = branding.logoUpdatedAt || 1;
    const rawName = branding.competitionName || "مسابقة ابوالفواطم";
    const shortBase = rawName.replace(/^مسابقة\s+/, "").trim() || "ابوالفواطم";
    const shortName = shortBase.length <= 12 ? shortBase : shortBase.slice(0, 12).trim();

    let icons;
    if (branding.logoUrl && branding.logoUrl.startsWith("data:image/")) {
      icons = [
        {
          src: `/api/pwa-icon/192.png?v=${version}`,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `/api/pwa-icon/512.png?v=${version}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `/api/pwa-icon/maskable-512.png?v=${version}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];
    } else if (branding.logoUrl && /^https?:\/\//i.test(branding.logoUrl)) {
      const busted = appendServerVersionParam(branding.logoUrl, version);
      const mimeType = /\.webp(\?|$)/i.test(busted)
        ? "image/webp"
        : /\.jpe?g(\?|$)/i.test(busted)
          ? "image/jpeg"
          : "image/png";
      icons = [
        { src: busted, sizes: "192x192", type: mimeType, purpose: "any" },
        { src: busted, sizes: "512x512", type: mimeType, purpose: "any" },
      ];
    } else {
      icons = [
        {
          src: `/pwa-192x192.png?v=${version}`,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `/pwa-512x512.png?v=${version}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `/pwa-maskable-512x512.png?v=${version}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];
    }

    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.json({
      id: "/",
      name: rawName,
      short_name: shortName,
      description: branding.competitionSlogan || "منصة مسابقات ثقافية تفاعلية بنظام الفرق والجولات",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#FAF7F2",
      theme_color: "#0B192C",
      orientation: "any",
      dir: "rtl",
      lang: "ar",
      icons,
    });
  };

  app.get("/manifest.json", serveDynamicManifest);
  app.get("/manifest.webmanifest", serveDynamicManifest);

  // Crafts a tailored English Islamic-heritage visual prompt from Arabic category metadata
  app.post("/api/ai/craft-image-prompt", requireAdminAuth, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const group = typeof req.body?.group === "string" ? req.body.group.trim() : "";

      if (!name) {
        return res.status(400).json({ error: "اسم القسم مطلوب لصياغة الوصف البصري." });
      }

      const ai = getAiClient();
      if (!ai) {
        return res.status(503).json({ error: "AI prompt service not configured" });
      }

      const resp = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: [
            `You are an art director for an Islamic cultural quiz competition.`,
            `Create ONE concise, vivid English photographic image prompt (45-65 words, single paragraph, no quotes, no markdown) representing this Arabic quiz category:`,
            `Category Name: ${name}`,
            `Group: ${group || "ثقافة وتراث"}`,
            `Description: ${description || "قسم ثقافي ومعرفي تراثي"}`,
            `Mandatory aesthetic rules:`,
            `- Warm Islamic heritage fine-art still-life or historic architectural scene.`,
            `- Dim warm golden lantern candlelight, deep midnight navy blue shadows, burnished antique gold and warm ivory parchment accents.`,
            `- Feature concrete symbolic historic objects relevant to the category (e.g., antique illuminated manuscripts, brass astrolabe, carved wooden rihal, compass, lanterns, mosque arches, tasbih, reed calligraphy pen).`,
            `- STRICTLY NO human figures, NO people, NO faces, NO silhouettes of persons, NO legible text overlays, NO watermarks.`,
          ].join("\n"),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            temperature: 0.7,
          },
        })
      );

      const prompt = (resp.text || "").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
      if (!prompt || prompt.length < 20) {
        return res.status(502).json({ error: "Empty visual prompt response" });
      }

      return res.json({ prompt });
    } catch (err: any) {
      console.warn("[AI IMAGE PROMPT] fallback triggered:", err?.message || err);
      return res.status(503).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Vite middleware with production-to-development fallback
  const distPath = path.join(process.cwd(), "dist");
  const hasBuild = fs.existsSync(path.join(distPath, "index.html"));

  if (process.env.NODE_ENV !== "production" || !hasBuild) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[BOOT] Vite development middleware loaded successfully.");
    } catch (e) {
      console.error("[CRITICAL] Vite failed to load:", e);
    }
  } else {
    console.log("[BOOT] Serving pre-built static files from dist folder.");
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith("sw.js") ||
            filePath.endsWith("manifest.json") ||
            /pwa-.*\.png$|apple-touch-icon\.png$/i.test(filePath)
          ) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          }
        },
      })
    );
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
