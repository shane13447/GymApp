import { JOINT_INJURY_MAP } from '@/constants/joint-injury-map';

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
});
