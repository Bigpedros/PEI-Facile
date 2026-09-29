import { configureSemanticResolver } from '../../core/semanticCatalog';
import { configurePromptKeywordMatcher } from '../../core/promptHeuristics';
import { suggestSemanticKey } from './peiSemanticCatalog';

const PEI_PROMPT_KEYWORDS = /^(?:anno\s+scolastico|a\.s\.|bambin[oa](?:\/[a-zA-Z])?|alunn[oa](?:\/[a-zA-Z])?|student(?:e|essa)(?:\/[a-zA-Z]+)?|cognome(?:\s+e\s+nome)?|nome|nominativo|codice\s*fiscale|codice\s+sostitutivo\s+personale|c\.f\.|nat[oa](?:\s+a|\s+il)?(?:\/[a-zA-Z])?|classe|sez(?:ione)?|plesso(?:\s+o\s+sede)?|sede|scuola|istituto|data(?:\s+di\s+nascita)?|firma|firme|oepac|aec|ore|punti|.*\b(?:rilasciat[oa]|redatt[oa]|approvat[oa])\s+in\s+data|verbale\s+allegato\s+n\.?.*)$/i;

export function registerPeiAdapter(): void {
  configureSemanticResolver(suggestSemanticKey);
  configurePromptKeywordMatcher((clean) => PEI_PROMPT_KEYWORDS.test(clean));
}
