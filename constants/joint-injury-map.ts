/**
 * Joint-to-muscle-group mapping for injury detection in coach modifications.
 * Maps joint/body-part keywords to affected muscle groups that should receive
 * load reduction or exercise substitution when the joint is injured.
 */

export const JOINT_INJURY_MAP = {
  // Upper body joints
  wrist: ['forearms', 'biceps', 'triceps', 'shoulders'],
  shoulder: ['shoulders', 'chest', 'triceps'],
  elbow: ['forearms', 'biceps', 'triceps'],
  neck: ['traps', 'shoulders', 'lats'],

  // Lower body joints
  knee: ['quads', 'hamstrings', 'glutes', 'calves'],
  ankle: ['calves', 'hamstrings', 'glutes', 'quads'],
  hip: ['glutes', 'hamstrings', 'quads', 'abs'],

  // Core/spine
  'lower back': ['lats', 'abs', 'glutes', 'hamstrings'],
  'lower-back': ['lats', 'abs', 'glutes', 'hamstrings'],
} as const;

/**
 * Alternative names/aliases for joints that users might say
 */
export const JOINT_ALIASES: Record<string, string> = {
  // Wrist aliases
  wrists: 'wrist',

  // Shoulder aliases
  shoulders: 'shoulder',

  // Elbow aliases
  elbows: 'elbow',

  // Knee aliases
  knees: 'knee',

  // Ankle aliases
  ankles: 'ankle',

  // Hip aliases
  hips: 'hip',

  // Neck aliases
  necks: 'neck',

  // Lower back aliases
  lowerback: 'lower-back',
  lumbar: 'lower-back',
  spine: 'lower-back',
  // BUG FIX: "back" -> "lower-back" alias is wrong. Generic "back pain" is not
  // necessarily lower back - could be upper back, mid back, rhomboids, etc.
  // Mapping it to lower-back drives the wrong substitutions and load reductions
  // (glutes, hamstrings) when the user might mean chest/shoulders/upper back.
  // Removed: back: 'lower-back',
} as const;

/**
 * Normalizes a joint name to its canonical form for lookup
 */
export const normalizeJointName = (input: string): string | null => {
  const normalized = input.toLowerCase().trim();

  // Direct match in JOINT_INJURY_MAP
  if (normalized in JOINT_INJURY_MAP) {
    return normalized;
  }

  // Check aliases
  if (normalized in JOINT_ALIASES) {
    return JOINT_ALIASES[normalized];
  }

  return null;
};

/**
 * Gets affected muscle groups for a joint injury
 */
export const getAffectedMuscleGroups = (jointName: string): readonly string[] | null => {
  const canonicalJoint = normalizeJointName(jointName);
  if (!canonicalJoint) {
    return null;
  }
  return JOINT_INJURY_MAP[canonicalJoint as keyof typeof JOINT_INJURY_MAP] ?? null;
};
