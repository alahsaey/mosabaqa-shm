import React from 'react';
import {
  BookOpen,
  Compass,
  Award,
  Sparkles,
  Landmark,
  ScrollText,
  Globe,
  Cpu,
  Trophy,
  Palette,
  LayoutGrid,
  Navigation,
  MapPin,
  Scale,
  Star,
  ShieldCheck,
  Library,
  HeartHandshake,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Compass,
  Award,
  Sparkles,
  Landmark,
  ScrollText,
  Globe,
  Cpu,
  Trophy,
  Palette,
  LayoutGrid,
  Navigation,
  MapPin,
  Scale,
  Star,
  ShieldCheck,
  Library,
  HeartHandshake,
};

export const BRAND_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'BookOpen', label: 'كتاب' },
  { value: 'ScrollText', label: 'مخطوطة' },
  { value: 'Library', label: 'مكتبة' },
  { value: 'Landmark', label: 'معلم' },
  { value: 'Scale', label: 'ميزان / فقه' },
  { value: 'Award', label: 'وسام' },
  { value: 'Star', label: 'نجمة' },
  { value: 'Compass', label: 'بوصلة' },
  { value: 'Globe', label: 'جغرافيا' },
  { value: 'Cpu', label: 'علوم' },
  { value: 'Palette', label: 'ثقافة' },
  { value: 'HeartHandshake', label: 'أخلاق وحقوق' },
];

interface BrandIconProps {
  name?: string;
  className?: string;
}

export const BrandIcon: React.FC<BrandIconProps> = ({ name, className = 'w-5 h-5' }) => {
  if (name && (name.startsWith('http://') || name.startsWith('https://') || name.startsWith('/'))) {
    return <img src={name} alt="" className={`${className} object-contain rounded`} />;
  }
  const IconComp = (name && ICON_MAP[name]) || BookOpen;
  return <IconComp className={className} />;
};

export default BrandIcon;
