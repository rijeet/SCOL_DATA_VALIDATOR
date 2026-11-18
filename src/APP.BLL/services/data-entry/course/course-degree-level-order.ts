import { DEGREE_SEEDS } from '@shared/constants/degreeSeeds.constants';

/**
 * Maps normalized degree names (uppercase trim) to SysAcademicDegrees.levelOrder.
 * Only the four seeded min/high degrees have a level. Awarded degrees stay null.
 */
export const COURSE_DEGREE_LEVEL_ORDER: Record<string, number> = Object.fromEntries(
  DEGREE_SEEDS.map((d) => [d.degreeName.toUpperCase(), d.levelOrder]),
);
