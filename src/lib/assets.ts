import competitionEmblem from '../assets/images/competition_emblem_1794722234382.jpg';
import heroStageBackdrop from '../assets/images/hero_stage_backdrop_1794722233899.jpg';
import categoryReligious from '../assets/images/category_religious_1794722233999.jpg';
import categoryScience from '../assets/images/category_science_1794722235813.jpg';
import categoryGeography from '../assets/images/category_geography_1794722234100.jpg';
import categoryCulture from '../assets/images/category_culture_1794722235191.jpg';

export const BRAND_ASSETS = {
  emblem: competitionEmblem,
  heroStage: heroStageBackdrop,
  categoryReligious,
  categoryScience,
  categoryGeography,
  categoryCulture,
};

export function getCategoryFallbackImage(group?: string): string {
  const g = (group || '').trim();
  if (g.includes('ديني') || g.includes('المعصوم') || g.includes('فقه') || g.includes('قرآن')) {
    return BRAND_ASSETS.categoryReligious;
  }
  if (g.includes('خرائط') || g.includes('جغراف')) {
    return BRAND_ASSETS.categoryGeography;
  }
  if (g.includes('تقني') || g.includes('علوم')) {
    return BRAND_ASSETS.categoryScience;
  }
  return BRAND_ASSETS.categoryCulture;
}
