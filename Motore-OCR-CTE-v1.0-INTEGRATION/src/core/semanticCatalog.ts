/**
 * Domain-neutral semantic resolver bridge.
 * The OCR/geometry engine does not own application semantics. A client adapter
 * may register a resolver; without one the engine returns an unbound suggestion.
 */
export type TemplateFieldType =
  | 'TEXT_SHORT'
  | 'TEXT_LONG'
  | 'DATE'
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'NUMBER'
  | 'BOOLEAN'
  | string;

export interface SemanticSuggestionResult {
  semanticKey: string | null;
  suggestedLabel: string;
  confidence: number;
  suggestedFieldType: TemplateFieldType;
}

export type SemanticResolver = (label: string, context?: string) => SemanticSuggestionResult;

let activeResolver: SemanticResolver | null = null;

export function configureSemanticResolver(resolver: SemanticResolver | null): void {
  activeResolver = resolver;
}

export function suggestSemanticKey(label: string, context = ''): SemanticSuggestionResult {
  if (activeResolver) return activeResolver(label, context);
  return {
    semanticKey: null,
    suggestedLabel: (label || '').trim(),
    confidence: 0,
    suggestedFieldType: 'TEXT_SHORT',
  };
}

export function generateFieldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fld_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
  }
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `fld_${randomPart}_${timePart}`;
}
