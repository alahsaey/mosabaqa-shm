import { ApprovedSource, CompetitionConfig, QuestionDifficulty, QuestionType, ScoringSettings } from '../types';
import { getAdminAuthHeaders } from '../lib/adminAuthHeaders';

export interface GeneratedGroundedQuestion {
  text: string;
  questionType: QuestionType;
  answer: string;
  options?: string[];
  difficulty: QuestionDifficulty;
  points: number;
  source: string;
  sourceName: string;
  sourceUrl: string;
  sourceId?: string;
  volumePageOrHadith: string;
  originalExcerpt: string;
  hint?: string;
  needsManualVerification: boolean;
  verificationNote?: string;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'archived';
}

export interface GenerateGroundedResult {
  insufficientSource: boolean;
  message?: string;
  questions: GeneratedGroundedQuestion[];
}

export interface SourceVerifyResult {
  ok: boolean;
  statusCode?: number;
  title?: string;
  textLength: number;
  preview: string;
  extractedText: string;
  message: string;
}

export const aiService = {
  async verifySourceContent(url: string): Promise<SourceVerifyResult> {
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/sources/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        textLength: 0,
        preview: '',
        extractedText: '',
        message: data.error || data.message || 'تعذر التحقق من المصدر.',
      };
    }
    return data as SourceVerifyResult;
  },

  async generateGroundedQuestions(params: {
    categoryName: string;
    categoryDescription?: string;
    approvedSources: ApprovedSource[];
    difficulty: QuestionDifficulty;
    questionTypes: QuestionType[];
    count: number;
    existingQuestions?: string[];
    letter?: string;
    scoringSettings?: ScoringSettings;
    autoApproveVerifiedAI?: boolean;
  }): Promise<GenerateGroundedResult> {
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/ai/generate-questions', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'تعذر توليد الأسئلة من الخادم.');
    }

    return {
      insufficientSource: Boolean(data.insufficientSource),
      message: data.message || '',
      questions: Array.isArray(data.questions) ? data.questions : [],
    };
  },

  async generateOptions(question: string, answer: string, otherAnswers: string[] = []): Promise<string[]> {
    try {
      const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/ai/generate-options', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question, answer, otherAnswers }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.options)) {
        return validateAndFixOptions([], answer, otherAnswers);
      }
      return validateAndFixOptions(data.options, answer, otherAnswers);
    } catch {
      return validateAndFixOptions([], answer, otherAnswers);
    }
  },

  async generateHint(question: string, answer: string, sourceExcerpt?: string): Promise<string> {
    try {
      const res = await fetch('/api/ai/generate-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, sourceExcerpt }),
      });
      const data = await res.json();
      return data.hint || 'استحضر السياق المعرفي والمصدر المعتمد للسؤال.';
    } catch {
      return 'تأمل في كلمات السؤال للوصول إلى الإجابة الصحيحة.';
    }
  },

  async rephraseText(text: string, type: 'question' | 'answer'): Promise<string> {
    try {
      const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/ai/rephrase', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, type }),
      });
      const data = await res.json();
      return data.text || text;
    } catch {
      return text;
    }
  },

  async parseBulkQuestions(params: {
    rawText: string;
    sourceName?: string;
    sourceUrl?: string;
    defaultDifficulty?: QuestionDifficulty;
  }): Promise<any[]> {
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/ai/parse-bulk', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل تحليل النص المرفق.');
    return Array.isArray(data.questions) ? data.questions : [];
  },
};

export function validateAndFixOptions(
  options: any,
  answer: string,
  otherAnswers: string[] = []
): string[] {
  const cleanAnswer = (answer || '').trim();
  if (!cleanAnswer) return [];

  const normalizeSimple = (str: string): string =>
    (str || '')
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, '');

  const answerHash = normalizeSimple(cleanAnswer);
  const seen = new Set<string>();
  const list: string[] = [];

  if (Array.isArray(options)) {
    for (const opt of options) {
      const clean = String(opt).trim();
      if (!clean || clean.includes('خيار بديل')) continue;
      const h = normalizeSimple(clean);
      if (!seen.has(h)) {
        seen.add(h);
        list.push(clean);
      }
    }
  }

  if (!seen.has(answerHash)) {
    if (list.length < 3) {
      list.push(cleanAnswer);
    } else {
      list[0] = cleanAnswer;
    }
    seen.add(answerHash);
  }

  const candidates = otherAnswers.map((a) => (a || '').trim()).filter(Boolean);
  for (const cand of candidates) {
    if (list.length >= 3) break;
    const h = normalizeSimple(cand);
    if (!seen.has(h) && h !== answerHash) {
      seen.add(h);
      list.push(cand);
    }
  }

  return list.slice(0, 4).sort(() => 0.5 - Math.random());
}
