import type { InfographicSpec } from '@office-unify/shared-types';
import { normalizeInfographicSpec } from './infographicValidation';

export function normalizeInfographicForRender(spec: InfographicSpec, industryName: string): InfographicSpec {
  return normalizeInfographicSpec(spec, industryName);
}

