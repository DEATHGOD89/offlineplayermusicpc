import test from 'node:test';
import assert from 'node:assert/strict';

// Bass profile map from App.jsx
const BASS_PROFILE_MAP = {
  'Studio Bass': { sub: 6, punch: 4 },
  'Home Theater': { sub: 12, punch: 8 },
  'Car Bass': { sub: 16, punch: 10 },
  'DJ Bass': { sub: 10, punch: 14 },
  'Cinema Bass': { sub: 14, punch: 9 },
  'Punjabi Bass': { sub: 14, punch: 12 },
  'Workout Bass': { sub: 12, punch: 14 }
};

function calculateDspGains(subLevel, bProfile, vBoost, mobileMode) {
  const profile = BASS_PROFILE_MAP[bProfile] || BASS_PROFILE_MAP['Home Theater'];
  const multiplier = subLevel / 50.0;

  const subGain = mobileMode 
    ? Math.min(8, profile.sub * multiplier * 0.65) 
    : profile.sub * multiplier;
  const punchGain = mobileMode 
    ? profile.punch * multiplier * 1.15 
    : profile.punch * multiplier;

  const highPassFreq = mobileMode ? 45 : 20;
  const subBassFreq = mobileMode ? 65 : 45;
  const vocalProtect = (subGain > 5) ? 1.5 : 0.0;

  return {
    multiplier,
    subGain,
    punchGain,
    highPassFreq,
    subBassFreq,
    vocalProtect,
    vBoost
  };
}

test('DSP: Default 50% setting yields calibrated 1.0x multiplier', () => {
  const dsp = calculateDspGains(50, 'Home Theater', 1.0, false);
  assert.equal(dsp.multiplier, 1.0, 'Multiplier at 50% must be exactly 1.0');
  assert.equal(dsp.subGain, 12, 'Home Theater sub gain at 50% must be 12 dB');
  assert.equal(dsp.punchGain, 8, 'Home Theater punch gain at 50% must be 8 dB');
  assert.equal(dsp.vBoost, 1.0, 'Default volume boost must be 1.0 (100%)');
});

test('DSP: Mobile phone speaker optimization prevents bottoming out', () => {
  const dsp = calculateDspGains(50, 'Home Theater', 1.0, true);
  assert.equal(dsp.highPassFreq, 45, 'Subsonic filter on mobile must cut below 45 Hz');
  assert.equal(dsp.subBassFreq, 65, 'Sub-bass center frequency on mobile must be elevated to 65 Hz');
  assert.ok(dsp.subGain <= 8, 'Mobile sub gain must be capped at 8 dB to prevent distortion');
  assert.ok(dsp.punchGain > 8, 'Mobile punch gain must be boosted for audible clarity');
});

test('DSP: Extreme 100% slider bass on mobile is safely clamped', () => {
  const dsp = calculateDspGains(100, 'Car Bass', 2.0, true);
  assert.equal(dsp.multiplier, 2.0);
  assert.equal(dsp.subGain, 8, 'Mobile sub gain must remain clamped at 8 dB even at 100% slider');
  assert.ok(dsp.punchGain > 20, 'Punch bass should scale for powerful kick without speaker flapping');
});

test('DSP: Zero slider produces flat 0 dB response', () => {
  const dsp = calculateDspGains(0, 'Home Theater', 1.0, false);
  assert.equal(dsp.multiplier, 0);
  assert.equal(dsp.subGain, 0);
  assert.equal(dsp.punchGain, 0);
  assert.equal(dsp.vocalProtect, 0);
});

test('DSP: All 7 bass profiles produce positive defined values', () => {
  for (const profileName of Object.keys(BASS_PROFILE_MAP)) {
    const desktop = calculateDspGains(50, profileName, 1.0, false);
    const mobile = calculateDspGains(50, profileName, 1.0, true);
    assert.ok(desktop.subGain > 0, `${profileName} desktop subGain must be > 0`);
    assert.ok(desktop.punchGain > 0, `${profileName} desktop punchGain must be > 0`);
    assert.ok(mobile.subGain > 0, `${profileName} mobile subGain must be > 0`);
    assert.ok(mobile.punchGain > 0, `${profileName} mobile punchGain must be > 0`);
  }
});
