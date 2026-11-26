import competitionEmblem from '../assets/images/competition_emblem_1794722234382.jpg';
import heroStageBackdrop from '../assets/images/hero_stage_backdrop_1794722233899.jpg';
import categoryReligious from '../assets/images/category_religious_1794722233999.jpg';
import categoryScience from '../assets/images/category_science_1794722235813.jpg';
import categoryGeography from '../assets/images/category_geography_1794722234100.jpg';
import categoryCulture from '../assets/images/category_culture_1794722235191.jpg';

// Bespoke Islamic-heritage cover art per competition category
import catProphetSeerah from '../assets/images/cat_prophet_seerah_1795725191149.jpg';
import catNehjBalagha from '../assets/images/cat_nehj_balagha_1795725193501.jpg';
import catZahraHeritage from '../assets/images/cat_zahra_heritage_1795725194413.jpg';
import catImamsLanterns from '../assets/images/cat_imams_lanterns_1795725195872.jpg';
import catRisalatScroll from '../assets/images/cat_risalat_scroll_1795725196165.jpg';
import catQuranRihal from '../assets/images/cat_quran_rihal_1795725197704.jpg';
import catFiguresAstrolabe from '../assets/images/cat_figures_astrolabe_1795725198989.jpg';
import catIslamicGeography from '../assets/images/cat_islamic_geography_1795725198872.jpg';

export const BRAND_ASSETS = {
  emblem: competitionEmblem,
  heroStage: heroStageBackdrop,
  // Legacy generic fallbacks retained for backward compatibility
  categoryReligious,
  categoryScience,
  categoryGeography,
  categoryCulture,
  // Bespoke per-category artwork
  categoryProphet: catProphetSeerah,
  categoryNehj: catNehjBalagha,
  categoryZahra: catZahraHeritage,
  categoryImams: catImamsLanterns,
  categoryRisalat: catRisalatScroll,
  categoryQuran: catQuranRihal,
  categoryFigures: catFiguresAstrolabe,
  categoryIslamicGeography: catIslamicGeography,
};

export const CATEGORY_BESPOKE_IMAGES_BY_ID: Record<string, string> = {
  prophet: catProphetSeerah,
  nehj: catNehjBalagha,
  zahra: catZahraHeritage,
  imams_history: catImamsLanterns,
  risalat_huquq: catRisalatScroll,
  quran_complete: catQuranRihal,
  general_wisdom: catFiguresAstrolabe,
  maps_global: catIslamicGeography,
};

const BESPOKE_IMAGE_POOL: string[] = [
  catProphetSeerah,
  catNehjBalagha,
  catZahraHeritage,
  catImamsLanterns,
  catRisalatScroll,
  catQuranRihal,
  catFiguresAstrolabe,
  catIslamicGeography,
];

const LEGACY_SHARED_VALUES = new Set<string>([
  categoryReligious,
  categoryScience,
  categoryGeography,
  categoryCulture,
]);

const LEGACY_URL_MARKERS = [
  'category_religious_1794722233999',
  'category_culture_1794722235191',
  'category_science_1794722235813',
  'category_geography_1794722234100',
  'unsplash.com',
  'flaticon.com',
  'icons8.com',
];

export interface CategoryImageDescriptor {
  id?: string;
  name?: string;
  group?: string;
  description?: string;
  imageUrl?: string;
}

/**
 * Detects whether a stored category imageUrl is empty or one of the old duplicated
 * default placeholders so existing Firestore records automatically display their
 * unique bespoke artwork while preserving user-uploaded or AI-generated covers.
 */
export function isLegacyDefaultCategoryImage(url?: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return true;
  if (LEGACY_SHARED_VALUES.has(trimmed)) return true;
  return LEGACY_URL_MARKERS.some((marker) => trimmed.includes(marker));
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns the most fitting bespoke Islamic-heritage artwork for a category
 * based on its ID, Arabic title, description, and group.
 */
export function getBespokeCategoryImage(cat?: CategoryImageDescriptor): string {
  if (!cat) return catProphetSeerah;

  const idKey = (cat.id || '').trim().toLowerCase();
  if (idKey && CATEGORY_BESPOKE_IMAGES_BY_ID[idKey]) {
    return CATEGORY_BESPOKE_IMAGES_BY_ID[idKey];
  }

  const combined = `${cat.name || ''} ${cat.description || ''}`.trim();
  if (/النبي|محمد|السيرة النبوية|غار حراء|البعثة|الهجرة/.test(combined)) {
    return catProphetSeerah;
  }
  if (/نهج البلاغة|البلاغة|ذو الفقار|أمير المؤمنين/.test(combined)) {
    return catNehjBalagha;
  }
  if (/الزهراء|فاطمة|فدك|الصديقة|الطاهرة/.test(combined)) {
    return catZahraHeritage;
  }
  if (/رسالة الحقوق|الصحيفة السجادية|زين العابدين|السجاد|الحقوق/.test(combined)) {
    return catRisalatScroll;
  }
  if (/القرآن|الآية|آيات|سورة|تفسير|تجويد|أكمل الآية/.test(combined)) {
    return catQuranRihal;
  }
  if (/الأئمة|المعصوم|أهل البيت|كربلاء|الحسين|الإمام|العسكري/.test(combined)) {
    return catImamsLanterns;
  }
  if (/أعلام|رموز|علماء|فقهاء|مفكر|علوم|طب|كيمياء|فلك/.test(combined)) {
    return catFiguresAstrolabe;
  }
  if (/حواضر|معالم|جغراف|خرائط|مدن|مكة|المدينة|النجف|الكوفة|مسجد/.test(combined)) {
    return catIslamicGeography;
  }

  const g = (cat.group || '').trim();
  if (g.includes('خرائط') || g.includes('جغراف')) {
    return catIslamicGeography;
  }
  if (g.includes('تقني') || g.includes('علوم') || g.includes('ثقاف')) {
    return catFiguresAstrolabe;
  }

  const seedStr = (cat.name || cat.id || g || 'default').trim();
  return BESPOKE_IMAGE_POOL[stableHash(seedStr) % BESPOKE_IMAGE_POOL.length];
}

/**
 * Resolves the active display image for a category:
 * - Preserves custom uploaded Data URLs, AI-generated URLs, custom external URLs,
 *   and explicitly selected bespoke assets.
 * - Automatically upgrades empty or legacy shared placeholder URLs to the category's
 *   dedicated bespoke artwork.
 */
export function resolveCategoryImage(cat?: CategoryImageDescriptor): string {
  if (!cat) return catProphetSeerah;
  const raw = (cat.imageUrl || '').trim();
  if (raw && !isLegacyDefaultCategoryImage(raw)) {
    return raw;
  }
  return getBespokeCategoryImage(cat);
}

export function getCategoryFallbackImage(group?: string, name?: string, id?: string): string {
  return getBespokeCategoryImage({ id, name, group });
}
