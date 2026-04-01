import {
  JOINT_INJURY_MAP,
  JOINT_ALIASES,
  normalizeJointName,
  getAffectedMuscleGroups,
} from '@/constants/joint-injury-map';

describe('JOINT_INJURY_MAP', () => {
  it('defines supported joint/body-part mappings for injury targeting', () => {
    expect(JOINT_INJURY_MAP.wrist).toEqual(expect.arrayContaining(['forearms']));
    expect(JOINT_INJURY_MAP.elbow).toEqual(expect.arrayContaining(['forearms', 'biceps', 'triceps']));
    expect(JOINT_INJURY_MAP.shoulder).toEqual(expect.arrayContaining(['shoulders']));
    expect(JOINT_INJURY_MAP.knee).toEqual(expect.arrayContaining(['quads', 'hamstrings', 'glutes', 'calves']));
  });

  it('uses non-empty muscle arrays for each mapped body part', () => {
    for (const muscles of Object.values(JOINT_INJURY_MAP)) {
      expect(muscles.length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate muscle groups within a single joint', () => {
    for (const [joint, muscles] of Object.entries(JOINT_INJURY_MAP)) {
      const unique = new Set(muscles);
      expect(unique.size).toBe(muscles.length);
    }
  });

  it('contains only non-empty muscle group strings', () => {
    for (const muscles of Object.values(JOINT_INJURY_MAP)) {
      for (const muscle of muscles) {
        expect(typeof muscle).toBe('string');
        expect(muscle.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('JOINT_ALIASES', () => {
  it('maps all aliases to valid canonical joints in JOINT_INJURY_MAP', () => {
    for (const [alias, canonical] of Object.entries(JOINT_ALIASES)) {
      expect(canonical in JOINT_INJURY_MAP).toBe(true);
    }
  });

  it('has no circular aliases (no alias points to another alias)', () => {
    for (const [alias, canonical] of Object.entries(JOINT_ALIASES)) {
      expect(canonical in JOINT_ALIASES).toBe(false);
    }
  });

  it('does not contain "back" as an alias (removed per bug fix)', () => {
    expect('back' in JOINT_ALIASES).toBe(false);
  });
});

describe('normalizeJointName', () => {
  describe('Valid inputs (direct canonical matches)', () => {
    it.each([
      ['wrist', 'wrist'],
      ['knee', 'knee'],
      ['shoulder', 'shoulder'],
      ['elbow', 'elbow'],
      ['ankle', 'ankle'],
      ['hip', 'hip'],
      ['neck', 'neck'],
      ['lower back', 'lower back'],
      ['lower-back', 'lower-back'],
    ])('normalizes "%s" to "%s"', (input, expected) => {
      expect(normalizeJointName(input)).toBe(expected);
    });
  });

  describe('Invalid inputs (no match)', () => {
    it.each([
      ['toe', null],
      ['finger', null],
      ['unknown', null],
      ['back', null],
    ])('returns null for "%s"', (input, expected) => {
      expect(normalizeJointName(input)).toBe(expected);
    });
  });

  describe('Null/Empty inputs', () => {
    it('returns null for empty string', () => {
      expect(normalizeJointName('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeJointName('   ')).toBeNull();
    });
  });

  describe('Boundary inputs (case/whitespace normalization)', () => {
    it('normalizes uppercase to lowercase', () => {
      expect(normalizeJointName('WRIST')).toBe('wrist');
    });

    it('trims surrounding whitespace', () => {
      expect(normalizeJointName('  Knee  ')).toBe('knee');
    });

    it('resolves plural alias to singular canonical', () => {
      expect(normalizeJointName('wrists')).toBe('wrist');
    });
  });

  describe('Exception inputs (alias resolution)', () => {
    it('resolves "lowerback" to "lower-back"', () => {
      expect(normalizeJointName('lowerback')).toBe('lower-back');
    });

    it('resolves "lumbar" to "lower-back"', () => {
      expect(normalizeJointName('lumbar')).toBe('lower-back');
    });

    it('resolves "spine" to "lower-back"', () => {
      expect(normalizeJointName('spine')).toBe('lower-back');
    });
  });
});

describe('getAffectedMuscleGroups', () => {
  describe('Valid inputs (returns correct muscle groups)', () => {
    it('returns correct muscles for wrist', () => {
      expect(getAffectedMuscleGroups('wrist')).toEqual(['forearms', 'biceps', 'triceps', 'shoulders']);
    });

    it('returns correct muscles for knee', () => {
      expect(getAffectedMuscleGroups('knee')).toEqual(['quads', 'hamstrings', 'glutes', 'calves']);
    });

    it('returns correct muscles for shoulder', () => {
      expect(getAffectedMuscleGroups('shoulder')).toEqual(['shoulders', 'chest', 'triceps']);
    });

    it('returns correct muscles for elbow', () => {
      expect(getAffectedMuscleGroups('elbow')).toEqual(['forearms', 'biceps', 'triceps']);
    });

    it('returns correct muscles for neck', () => {
      expect(getAffectedMuscleGroups('neck')).toEqual(['traps', 'shoulders', 'back']);
    });

    it('returns correct muscles for ankle', () => {
      expect(getAffectedMuscleGroups('ankle')).toEqual(['calves', 'hamstrings', 'glutes', 'quads']);
    });

    it('returns correct muscles for hip', () => {
      expect(getAffectedMuscleGroups('hip')).toEqual(['glutes', 'hamstrings', 'quads', 'hip-flexors']);
    });

    it('returns correct muscles for "lower back"', () => {
      expect(getAffectedMuscleGroups('lower back')).toEqual(['lower-back', 'glutes', 'hamstrings']);
    });

    it('returns correct muscles for "lower-back"', () => {
      expect(getAffectedMuscleGroups('lower-back')).toEqual(['lower-back', 'glutes', 'hamstrings']);
    });
  });

  describe('Invalid inputs', () => {
    it('returns null for "toe"', () => {
      expect(getAffectedMuscleGroups('toe')).toBeNull();
    });

    it('returns null for "unknown"', () => {
      expect(getAffectedMuscleGroups('unknown')).toBeNull();
    });
  });

  describe('Null/Empty inputs', () => {
    it('returns null for empty string', () => {
      expect(getAffectedMuscleGroups('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(getAffectedMuscleGroups('   ')).toBeNull();
    });
  });

  describe('Boundary inputs (all 9 joints + alias chain)', () => {
    it('returns results for all 9 canonical joint keys', () => {
      const joints = Object.keys(JOINT_INJURY_MAP);
      for (const joint of joints) {
        const result = getAffectedMuscleGroups(joint);
        expect(result).not.toBeNull();
        expect(Array.isArray(result)).toBe(true);
        expect(result!.length).toBeGreaterThan(0);
      }
    });

    it('returns same muscles for alias "wrists" as canonical "wrist"', () => {
      expect(getAffectedMuscleGroups('wrists')).toEqual(getAffectedMuscleGroups('wrist'));
    });
  });

  describe('Exception inputs (alias chain to muscles)', () => {
    it('resolves "lowerback" alias through to muscle groups', () => {
      expect(getAffectedMuscleGroups('lowerback')).toEqual(['lower-back', 'glutes', 'hamstrings']);
    });
  });
});
