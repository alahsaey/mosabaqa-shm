import { getAdminAuthHeaders } from '../lib/adminAuthHeaders';

export interface CategoryPromptInput {
  name: string;
  description?: string;
  group?: string;
}

export interface GeneratedCategoryImageResult {
  imageUrl: string;
  prompt: string;
  seed: number;
  usedGeminiPrompt: boolean;
}

const UNIFIED_STYLE_SUFFIX =
  'Islamic heritage fine-art still-life photography, warm golden lantern candlelight, deep midnight navy blue shadows, burnished gold and warm ivory parchment accents, intricate arabesque ornaments and historic artifacts, rich museum depth of field, photorealistic, strictly no human faces, no people, no text overlay, no watermark';

const TOPIC_VISUAL_MAP: Array<{ pattern: RegExp; scene: string }> = [
  {
    pattern: /النبي|محمد|السيرة النبوية|غار حراء|الهجرة|البعثة|المدينة/,
    scene:
      'Al-Masjid an-Nabawi green dome and slender minarets glowing softly at golden twilight sunset behind an antique illuminated Islamic manuscript and pierced-brass lantern on a carved walnut desk',
  },
  {
    pattern: /نهج البلاغة|البلاغة|أمير المؤمنين|ذو الفقار|علي/,
    scene:
      'open antique leather-bound Arabic manuscript with delicate gold calligraphy borders and bamboo reed pen beside a symbolic ornate damascene Zulfiqar sword hilt and glowing heritage brass lantern',
  },
  {
    pattern: /الزهراء|فاطمة|فدك|الصديقة|الطاهرة|تسبيح/,
    scene:
      'luminous pearl and polished sandalwood Islamic tasbih prayer beads coiled gracefully over a gold-embossed velvet heritage book beside a carved wooden mashrabiya lattice window with soft golden rays',
  },
  {
    pattern: /الأئمة|المعصوم|أهل البيت|الحسين|كربلاء|العسكري|الرضا|الكاظم|الباقر|الصادق/,
    scene:
      'twelve ornate pierced-brass Islamic lanterns glowing warmly in a symmetrical perspective row beneath historic pointed stone arches of an ancient mosque colonnade',
  },
  {
    pattern: /رسالة الحقوق|الصحيفة السجادية|السجاد|زين العابدين|أخلاق|حقوق|دعاء|مناجاة/,
    scene:
      'historic aged parchment scroll tied with braided gold cord unrolled on a carved wooden lectern inside an antique stone-arched Islamic library lit by an oil lantern',
  },
  {
    pattern: /قرآن|آية|آيات|سورة|تفسير|تجويد|تلاوة|وحي/,
    scene:
      'open richly illuminated antique Holy Quran resting on an inlaid carved wooden rihal book stand with delicate gold-leaf geometric borders and a hanging pierced-brass lantern',
  },
  {
    pattern: /أعلام|رموز|علماء|فقهاء|مفكر|فلسفة|طب|كيمياء|فلك|علوم|حكمة/,
    scene:
      'authentic antique engraved brass Islamic astrolabe and brass inkwell beside classic leather-bound scholarly volumes with gold-tooled spines on a dark walnut library desk',
  },
  {
    pattern: /حواضر|معالم|جغراف|خرائط|مدن|مكة|النجف|الكوفة|سامراء|بغداد|تاريخ/,
    scene:
      'antique brass compass and dividers resting atop a vintage aged parchment historical map of the Islamic world with delicate dome architectural sketches and warm lantern glow',
  },
  {
    pattern: /فقه|أحكام|عبادات|صلاة|صيام|حج|زكاة|مسائل/,
    scene:
      'stacked antique leather-bound Islamic jurisprudence volumes with gold-tooled spines beside a brass oil lamp, carved wooden bookmark, and woven prayer rug corner in a quiet historic madrasa',
  },
  {
    pattern: /عقيدة|عقائد|توحيد|إمامة|عدل|معاد|كلام/,
    scene:
      'ornate gilded geometric star dome ceiling and hanging golden chandelier lanterns inside a serene historic Islamic sanctuary bathed in warm amber twilight',
  },
  {
    pattern: /شعر|أدب|بلاغة|لغة|نحو|معلقات|قصائد/,
    scene:
      'antique open Arabic poetry manuscript on aged ivory parchment beside a hand-carved reed qalam pen, brass inkpot, and glowing heritage lantern on embroidered damask fabric',
  },
  {
    pattern: /رمضان|عاشوراء|غدير|مناسبات|أعياد|مولد/,
    scene:
      'crescent moon silhouette above historic Islamic mosque minarets with warm glowing pierced-brass lanterns arranged along a carved stone balustrade at twilight',
  },
  {
    pattern: /تقني|رياضيات|هندسة|ابتكار|اختراع/,
    scene:
      'antique brass geometric compass, engraved astrolabe rings, and Islamic geometric star diagrams sketched on warm parchment under golden lantern light',
  },
];

/**
 * Deterministic Arabic-to-English heritage visual prompt builder that works
 * completely client-side (including static hosts like Cloudflare Pages).
 */
export function buildLocalCategoryVisualPrompt(input: CategoryPromptInput): string {
  const combined = `${input.name || ''} ${input.description || ''} ${input.group || ''}`.trim();
  const matchedScenes = TOPIC_VISUAL_MAP.filter((entry) => entry.pattern.test(combined)).map(
    (entry) => entry.scene
  );

  let coreScene: string;
  if (matchedScenes.length > 0) {
    coreScene = matchedScenes[0];
  } else {
    const group = (input.group || '').trim();
    if (group.includes('خرائط') || group.includes('جغراف')) {
      coreScene =
        'antique brass compass and vintage parchment map of historic Islamic cities and sacred landmarks beside a glowing brass lantern';
    } else if (group.includes('علوم') || group.includes('تقني')) {
      coreScene =
        'antique engraved brass Islamic astrolabe and classic leather-bound scholarly manuscripts on a carved dark walnut desk';
    } else if (group.includes('تاريخ')) {
      coreScene =
        'historic vaulted Islamic stone archway with glowing brass lanterns, unrolled parchment scrolls, and ancient leather volumes';
    } else {
      coreScene =
        'ornate open antique Arabic heritage manuscript with gold geometric borders, reed calligraphy pen, and glowing pierced-brass lantern on carved dark wood';
    }
  }

  return `${coreScene}, ${UNIFIED_STYLE_SUFFIX}`;
}

/**
 * Attempts to craft an enriched English visual prompt via server-side Gemini (`gemini-4-hydrogen`),
 * seamlessly falling back to the client-side heritage prompt builder on static hosting or offline.
 */
async function craftCategoryVisualPrompt(
  input: CategoryPromptInput
): Promise<{ prompt: string; usedGeminiPrompt: boolean }> {
  const fallbackPrompt = buildLocalCategoryVisualPrompt(input);

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });

    const res = await fetch('/api/ai/craft-image-prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.name,
        description: input.description || '',
        group: input.group || '',
      }),
      signal: controller.signal,
    });

    window.clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (typeof data?.prompt === 'string' && data.prompt.trim().length >= 25) {
        return {
          prompt: `${data.prompt.trim()}, strictly no human faces, no people, no text overlay`,
          usedGeminiPrompt: true,
        };
      }
    }
  } catch {
    // Expected on static hosts (Cloudflare Pages) or when server AI key is not set
  }

  return { prompt: fallbackPrompt, usedGeminiPrompt: false };
}

function preloadImageUrl(url: string, timeoutMs = 28000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      img.src = '';
      reject(new Error('انتهى وقت تحميل الصورة المولدة. يرجى إعادة المحاولة.'));
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (img.naturalWidth < 32 || img.naturalHeight < 32) {
        reject(new Error('الصورة المستلمة غير صالحة.'));
        return;
      }
      resolve();
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error('تعذر تحميل الصورة من الرابط المطلوب.'));
    };

    img.src = url;
  });
}

function buildPollinationsUrl(prompt: string, seed: number, model?: string): string {
  const cleanPrompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 460);
  const params = new URLSearchParams({
    width: '960',
    height: '720',
    nologo: 'true',
    enhance: 'true',
    seed: String(seed),
  });
  if (model) {
    params.set('model', model);
  }
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?${params.toString()}`;
}

/**
 * Generates a unique, theme-aligned Islamic-heritage AI cover image for a category
 * using Gemini-crafted prompt (when backend is available) + Pollinations instant image API.
 */
export async function generateAICategoryImage(
  input: CategoryPromptInput & { seed?: number }
): Promise<GeneratedCategoryImageResult> {
  if (!input.name || !input.name.trim()) {
    throw new Error('يرجى كتابة اسم القسم أولاً لتوليد صورة متوافقة معه.');
  }

  const seed = input.seed ?? Math.floor(100000 + Math.random() * 899999);
  const { prompt, usedGeminiPrompt } = await craftCategoryVisualPrompt(input);

  const primaryUrl = buildPollinationsUrl(prompt, seed, 'flux');
  try {
    await preloadImageUrl(primaryUrl, 30000);
    return { imageUrl: primaryUrl, prompt, seed, usedGeminiPrompt };
  } catch {
    // Retry once with standard default model and a fresh seed
    const fallbackSeed = seed + 17;
    const retryUrl = buildPollinationsUrl(prompt, fallbackSeed);
    await preloadImageUrl(retryUrl, 30000);
    return { imageUrl: retryUrl, prompt, seed: fallbackSeed, usedGeminiPrompt };
  }
}

/**
 * Validates an external HTTP/HTTPS image URL and verifies that it loads cleanly.
 */
export async function validateExternalImageUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('يرجى إدخال رابط الصورة أولاً.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('صيغة الرابط غير صالحة. يجب أن يبدأ بـ https://');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('يُسمح فقط بروابط الصور التي تبدأ بـ https:// أو http://');
  }

  await preloadImageUrl(parsed.toString(), 14000);
  return parsed.toString();
}

/**
 * Reads a locally uploaded image file, center-crops it to a crisp 4:3 (800x600) canvas,
 * and returns a compact JPEG Data URL safe for Firestore persistence (< 180 KB).
 */
export async function processCategoryImageUpload(
  file: File
): Promise<{ dataUrl: string; sizeKb: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف المختار ليس صورة صالحة (يرجى اختيار JPG أو PNG أو WebP).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير جداً (الحد الأقصى 12 ميجابايت قبل الضغط).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة من الجهاز.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('تعذر معالجة ملف الصورة المرفوع.'));
    el.src = rawDataUrl;
  });

  const targetW = 800;
  const targetH = 600;
  const targetRatio = targetW / targetH;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcRatio = srcW / srcH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > targetRatio) {
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
  } else if (srcRatio < targetRatio) {
    sh = srcW / targetRatio;
    sy = (srcH - sh) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('المتصفح لا يدعم معالجة الصور حالياً.');
  }

  ctx.fillStyle = '#0B192C';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

  let quality = 0.84;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 220000 && quality > 0.52) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  return {
    dataUrl,
    sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
  };
}
