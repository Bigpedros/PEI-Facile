/** Domain-neutral prompt recognition with optional client extension. */
export type PromptKeywordMatcher = (cleanLabel: string) => boolean;
let keywordMatcher: PromptKeywordMatcher | null = null;

export function configurePromptKeywordMatcher(matcher: PromptKeywordMatcher | null): void {
  keywordMatcher = matcher;
}

export function isExplicitPromptGeneric(str: string): boolean {
  if (!str) return false;
  const clean = str.replace(/[_\.\s]+$/, '').trim();
  if (clean.length < 2 || clean.length > 80) return false;
  if (/^\[.+\]$/.test(clean)) return true;
  if (/[:?]\s*$/.test(clean)) {
    if (clean.split(/\s+/).length > 8) return false;
    return true;
  }
  return keywordMatcher ? keywordMatcher(clean) : false;
}
