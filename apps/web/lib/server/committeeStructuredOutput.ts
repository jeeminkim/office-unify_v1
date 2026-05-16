import 'server-only';

import type {
  CommitteeDiscussionLineDto,
  PersonaStructuredOutputQualitySummary,
} from '@office-unify/shared-types';
import { parsePersonaStructuredOutput, buildInsufficientPersonaStructuredOutput } from '@/lib/server/personaStructuredOutput';

export function enrichCommitteeLinesWithStructuredOutput(lines: CommitteeDiscussionLineDto[]): {
  lines: CommitteeDiscussionLineDto[];
  personaStructuredOutputSummary: PersonaStructuredOutputQualitySummary;
} {
  let parseSuccessCount = 0;
  let parseFailedCount = 0;
  let sanitizedCount = 0;
  let bannedPhraseCount = 0;
  let lowConfidenceCount = 0;

  const next = lines.map((line) => {
    const slug = line.slug;
    const parsed = parsePersonaStructuredOutput(line.content, slug);
    if (!parsed.ok) {
      parseFailedCount += 1;
      const fallback = buildInsufficientPersonaStructuredOutput(slug, parsed.fallbackSummary);
      return {
        ...line,
        content: parsed.fallbackSummary.slice(0, 8000),
        structuredOutput: fallback,
        structuredParseWarnings: parsed.warnings,
      };
    }
    parseSuccessCount += 1;
    if (parsed.warnings.length > 0) sanitizedCount += 1;
    bannedPhraseCount += parsed.bannedPhraseCount;
    if (parsed.lowConfidence) lowConfidenceCount += 1;
    return {
      ...line,
      content: parsed.displayText.slice(0, 8000),
      structuredOutput: parsed.output,
      structuredParseWarnings: parsed.warnings,
    };
  });

  return {
    lines: next,
    personaStructuredOutputSummary: {
      parseSuccessCount,
      parseFailedCount,
      sanitizedCount,
      bannedPhraseCount,
      lowConfidenceCount,
    },
  };
}
