// Dynamic Web App Manifest, Favicon, Apple Touch Icon, and Service Worker cache-busting manager

export interface DynamicPwaBrandingInput {
  logoUrl?: string;
  logoUpdatedAt?: number;
  competitionName?: string;
  competitionSlogan?: string;
}

const DEFAULT_FALLBACK_192 = '/pwa-192x192.png';
const DEFAULT_FALLBACK_512 = '/pwa-512x512.png';
const DEFAULT_FALLBACK_MASKABLE = '/pwa-maskable-512x512.png';
const DEFAULT_FALLBACK_APPLE = '/apple-touch-icon.png';

let currentManifestBlobUrl: string | null = null;
let lastAppliedSignature = '';

export function isValidCustomLogoUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('flaticon.com') || trimmed.includes('icons8.com')) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

export function appendLogoCacheBuster(url: string, version?: number | string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const stamp = version ? String(version) : String(Date.now());
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(trimmed, base);
    parsed.searchParams.set('v', stamp);
    // Preserve relative path if input was relative
    if (trimmed.startsWith('/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    const clean = trimmed.replace(/([?&])v=\d+(&?)/, (_, sep, trail) => (trail ? sep : ''));
    const joiner = clean.includes('?') ? '&' : '?';
    return `${clean}${joiner}v=${stamp}`;
  }
}

export function stripLogoCacheBuster(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(trimmed, base);
    parsed.searchParams.delete('v');
    if (trimmed.startsWith('/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load logo image'));
    img.src = src;
  });
}

function renderSquarePngFromImage(
  img: HTMLImageElement,
  size: number,
  options?: { maskablePaddingRatio?: number; backgroundColor?: string }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  const bg = options?.backgroundColor || '#0B192C';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const paddingRatio = options?.maskablePaddingRatio ?? 0;
  const padding = Math.round(size * paddingRatio);
  const drawSize = size - padding * 2;

  const iw = img.naturalWidth || img.width || size;
  const ih = img.naturalHeight || img.height || size;

  if (paddingRatio > 0) {
    // Fit cleanly inside safe zone without clipping logo edges
    const scale = Math.min(drawSize / iw, drawSize / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  } else {
    // Center-crop square cover
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Optimizes an uploaded image File into a crisp 512x512 square PNG/WebP data URL
 * suitable for storing in Firestore settings (< 250 KB) and rendering as PWA icons.
 */
export async function processUploadedLogoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageForCanvas(objectUrl);
    const pngDataUrl = renderSquarePngFromImage(img, 512, {
      maskablePaddingRatio: 0,
      backgroundColor: '#0B192C',
    });

    // If PNG is compact enough for Firestore (< 320 KB), keep crisp PNG
    if (pngDataUrl.length <= 320_000) {
      return pngDataUrl;
    }

    // Otherwise try WebP / JPEG at high quality while staying under Firestore limits
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0B192C';
      ctx.fillRect(0, 0, 512, 512);
      const iw = img.naturalWidth || img.width || 512;
      const ih = img.naturalHeight || img.height || 512;
      const side = Math.min(iw, ih);
      ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, 512, 512);
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
      if (jpegUrl.length <= 320_000) return jpegUrl;
      return canvas.toDataURL('image/jpeg', 0.75);
    }
    return pngDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function upsertHeadLink(rel: string, attrs: Record<string, string>) {
  const head = document.head;
  if (!head) return;

  const existing = Array.from(head.querySelectorAll(`link[rel="${rel}"]`));
  let linkEl = existing[0] as HTMLLinkElement | undefined;
  if (!linkEl) {
    linkEl = document.createElement('link');
    linkEl.rel = rel;
    head.appendChild(linkEl);
  }
  // Remove duplicates so browsers pick our updated link deterministically
  existing.slice(1).forEach((el) => el.remove());

  Object.entries(attrs).forEach(([k, v]) => {
    linkEl!.setAttribute(k, v);
  });
}

function upsertMeta(name: string, content: string, isProperty = false) {
  const head = document.head;
  if (!head) return;
  const selector = isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let meta = head.querySelector(selector) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    if (isProperty) meta.setAttribute('property', name);
    else meta.setAttribute('name', name);
    head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function makeShortName(fullName: string): string {
  const cleaned = fullName.replace(/^مسابقة\s+/, '').trim() || 'ابوالفواطم';
  return cleaned.length <= 12 ? cleaned : cleaned.slice(0, 12).trim();
}

function inferImageMimeType(url: string): string {
  if (url.startsWith('data:image/png') || /\.png(\?|$)/i.test(url)) return 'image/png';
  if (url.startsWith('data:image/webp') || /\.webp(\?|$)/i.test(url)) return 'image/webp';
  if (url.startsWith('data:image/svg') || /\.svg(\?|$)/i.test(url)) return 'image/svg+xml';
  return 'image/jpeg';
}

export function notifyServiceWorkerIconUpdate(version: number | string) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.active?.postMessage({ type: 'INVALIDATE_PWA_ICONS', version });
        reg.waiting?.postMessage({ type: 'INVALIDATE_PWA_ICONS', version });
        reg.update().catch(() => {});
      })
      .catch(() => {});
  } catch {}
}

/**
 * Dynamically updates <link rel="icon">, <link rel="apple-touch-icon">, and
 * <link rel="manifest"> from the live Firestore logoUrl + timestamp, generating
 * exact 180x180, 192x192, 512x512, and maskable 512x512 PNG icons on the fly.
 */
export async function syncDynamicPwaBranding(input: DynamicPwaBrandingInput): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const name = (input.competitionName || 'مسابقة ابوالفواطم').trim();
  const shortName = makeShortName(name);
  const description = (
    input.competitionSlogan || 'منصة مسابقات ثقافية تفاعلية بنظام الفرق والجولات'
  ).trim();
  const version = input.logoUpdatedAt || 1;
  const hasCustomLogo = isValidCustomLogoUrl(input.logoUrl);

  const signature = `${name}|${description}|${version}|${hasCustomLogo ? input.logoUrl : 'default'}`;
  if (signature === lastAppliedSignature) return;
  lastAppliedSignature = signature;

  const origin = window.location.origin;

  // Update title & iOS web app title immediately
  document.title = `${name} | المنصة الثقافية التفاعلية`;
  upsertMeta('apple-mobile-web-app-title', shortName);
  upsertMeta('og:title', `${name} | المنصة الثقافية التفاعلية`, true);

  let icon192 = `${origin}${appendLogoCacheBuster(DEFAULT_FALLBACK_192, version)}`;
  let icon512 = `${origin}${appendLogoCacheBuster(DEFAULT_FALLBACK_512, version)}`;
  let iconMaskable512 = `${origin}${appendLogoCacheBuster(DEFAULT_FALLBACK_MASKABLE, version)}`;
  let appleTouchIcon = `${origin}${appendLogoCacheBuster(DEFAULT_FALLBACK_APPLE, version)}`;
  let iconType = 'image/png';

  if (hasCustomLogo && input.logoUrl) {
    const cacheBustedSource = appendLogoCacheBuster(input.logoUrl, version);
    try {
      const img = await loadImageForCanvas(cacheBustedSource);
      icon192 = renderSquarePngFromImage(img, 192);
      icon512 = renderSquarePngFromImage(img, 512);
      iconMaskable512 = renderSquarePngFromImage(img, 512, {
        maskablePaddingRatio: 0.12,
        backgroundColor: '#0B192C',
      });
      appleTouchIcon = renderSquarePngFromImage(img, 180);
      iconType = 'image/png';
    } catch {
      // External host may block CORS canvas export: still point directly to cache-busted URL
      const absoluteUrl = cacheBustedSource.startsWith('/')
        ? `${origin}${cacheBustedSource}`
        : cacheBustedSource;
      icon192 = absoluteUrl;
      icon512 = absoluteUrl;
      iconMaskable512 = absoluteUrl;
      appleTouchIcon = absoluteUrl;
      iconType = inferImageMimeType(absoluteUrl);
    }
  }

  // 1. Update Browser Favicon & iOS Apple Touch Icon dynamically
  upsertHeadLink('icon', { type: iconType, sizes: '192x192', href: icon192 });
  upsertHeadLink('shortcut icon', { type: iconType, href: icon192 });
  upsertHeadLink('apple-touch-icon', { sizes: '180x180', href: appleTouchIcon });
  if (!icon512.startsWith('data:')) {
    upsertMeta('og:image', icon512, true);
  }

  // 2. Build Dynamic Web App Manifest with absolute start_url/scope so Blob manifest works reliably
  const manifestPayload = {
    id: `${origin}/`,
    name,
    short_name: shortName,
    description,
    start_url: `${origin}/`,
    scope: `${origin}/`,
    display: 'standalone',
    background_color: '#FAF7F2',
    theme_color: '#0B192C',
    orientation: 'any',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      {
        src: icon192,
        sizes: '192x192',
        type: iconType,
        purpose: 'any',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: iconType,
        purpose: 'any',
      },
      {
        src: iconMaskable512,
        sizes: '512x512',
        type: iconType,
        purpose: 'maskable',
      },
    ],
  };

  try {
    const blob = new Blob([JSON.stringify(manifestPayload)], {
      type: 'application/manifest+json',
    });
    const nextBlobUrl = URL.createObjectURL(blob);
    const oldBlobUrl = currentManifestBlobUrl;
    currentManifestBlobUrl = nextBlobUrl;

    let manifestLink = document.getElementById('dynamic-manifest-link') as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    }
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.id = 'dynamic-manifest-link';
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = nextBlobUrl;

    if (oldBlobUrl) {
      window.setTimeout(() => URL.revokeObjectURL(oldBlobUrl), 5000);
    }
  } catch (err) {
    console.warn('[PWA] Could not inject dynamic manifest blob:', err);
  }

  // 3. Notify Service Worker to flush any stale cached icon/manifest responses
  notifyServiceWorkerIconUpdate(version);
}
