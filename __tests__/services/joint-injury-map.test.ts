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
  describe('Valid inputs (structural properties)', () => {
    it('returns a non-empty string array for every canonical joint', () => {
      for (const joint of Object.keys(JOINT_INJURY_MAP)) {
        const result = getAffectedMuscleGroups(joint);
        expect(result).not.toBeNull();
        expect(Array.isArray(result)).toBe(true);
        expect(result!.length).toBeGreaterThan(0);
        result!.forEach((muscle) => {
          expect(typeof muscle).toBe('string');
          expect(muscle.trim().length).toBeGreaterThan(0);
        });
      }
    });

    it('returns the same array reference as the JOINT_INJURY_MAP entry for canonical joints', () => {
      for (const [joint, expected] of Object.entries(JOINT_INJURY_MAP)) {
        expect(getAffectedMuscleGroups(joint)).toEqual(expected);
      }
    });

    it('smoke: wrist includes forearms', () => {
      expect(getAffectedMuscleGroups('wrist')).toEqual(expect.arrayContaining(['forearms']));
    });

    it('smoke: knee includes quads and hamstrings', () => {
      expect(getAffectedMuscleGroups('knee')).toEqual(expect.arrayContaining(['quads', 'hamstrings']));
    });

    it('handles both "lower back" and "lower-back" forms', () => {
      const lowerBack = getAffectedMuscleGroups('lower back');
      const lowerBackHyphen = getAffectedMuscleGroups('lower-back');
      expect(lowerBack).not.toBeNull();
      expect(lowerBack).toEqual(lowerBackHyphen);
    });
  });

  describe('Invalid inputs', () => {
    it.each(['toe', 'unknown', 'finger'])('returns null for "%s"', (input) => {
      expect(getAffectedMuscleGroups(input)).toBeNull();
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

  describe('Boundary inputs (alias resolution chain)', () => {
    it('returns same muscles for alias "wrists" as canonical "wrist"', () => {
      expect(getAffectedMuscleGroups('wrists')).toEqual(getAffectedMuscleGroups('wrist'));
    });

    it('resolves every alias to the same result as its canonical joint', () => {
      for (const [alias, canonical] of Object.entries(JOINT_ALIASES)) {
        expect(getAffectedMuscleGroups(alias)).toEqual(getAffectedMuscleGroups(canonical));
      }
    });
  });

  describe('Exception inputs (alias chain to muscles)', () => {
    it('resolves "lowerback" alias through to a non-null muscle group array', () => {
      const result = getAffectedMuscleGroups('lowerback');
      expect(result).not.toBeNull();
      expect(result).toEqual(getAffectedMuscleGroups('lower-back'));
    });
  });
});
