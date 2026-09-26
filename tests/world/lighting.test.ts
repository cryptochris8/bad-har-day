import { describe, expect, it } from 'vitest';
import { brightness, lightingAt, mixHex, parseClock, smooth01 } from '../../src/world/lighting';

const blue = (h: number) => h & 255;
const red = (h: number) => (h >> 16) & 255;

describe('time-of-day lighting keyframes', () => {
  it('5:15 is dark-blue pre-dawn: stars, moonlight, warm lamps on, house lights off', () => {
    const s = lightingAt(315, 'clear');
    expect(s.stars).toBeGreaterThan(0.95);
    expect(s.moon).toBeGreaterThan(0.95);
    expect(s.sunAmount).toBe(0);
    expect(blue(s.keyColor)).toBeGreaterThan(red(s.keyColor)); // cool moonlight
    expect(blue(s.skyTop)).toBeGreaterThan(red(s.skyTop));
    expect(brightness(s.skyTop)).toBeLessThan(0.15);
    expect(s.nightLamps).toBe(1);
    expect(s.houseLamps).toBe(0);
    expect(s.outdoorLamps).toBe(1);
    expect(s.daylight).toBe(0);
    expect(s.sunDisc).toBe(0);
  });

  it('6:00 sunrise begins: peach/pink horizon, house lights on, stars fading', () => {
    const s = lightingAt(360, 'clear');
    expect(red(s.skyHorizon)).toBeGreaterThan(blue(s.skyHorizon));
    expect(s.glow).toBeGreaterThan(0.4);
    expect(s.houseLamps).toBeGreaterThan(0.9);
    expect(s.stars).toBeLessThan(0.8);
    expect(s.stars).toBeGreaterThan(0);
  });

  it('7:00 is golden, 8:00 bright and clear with lamps off', () => {
    const g = lightingAt(420, 'clear');
    expect(g.keyIntensity).toBeGreaterThan(1.8);
    expect(g.sunAmount).toBeGreaterThan(0.99);
    expect(red(g.keyColor)).toBeGreaterThan(blue(g.keyColor));
    expect(g.stars).toBe(0);
    const d = lightingAt(480, 'clear');
    expect(d.keyIntensity).toBeGreaterThan(g.keyIntensity);
    expect(d.nightLamps).toBe(0);
    expect(d.houseLamps).toBe(0);
    expect(d.outdoorLamps).toBe(0);
    expect(d.daylight).toBe(1);
    expect(brightness(d.skyHorizon)).toBeGreaterThan(0.85);
    expect(d.sunY).toBeGreaterThan(0.25);
  });

  it('brightens monotonically through the morning; stars and moon only fade', () => {
    let prevDay = -1;
    let prevStars = 2;
    let prevSun = -1;
    for (let m = 315; m <= 485; m += 1) {
      const s = lightingAt(m, 'clear');
      expect(s.daylight).toBeGreaterThanOrEqual(prevDay - 1e-9);
      expect(s.stars).toBeLessThanOrEqual(prevStars + 1e-9);
      if (m >= 362) {
        expect(s.keyIntensity).toBeGreaterThanOrEqual(prevSun - 1e-9);
        prevSun = s.keyIntensity;
      }
      prevDay = s.daylight;
      prevStars = s.stars;
      expect(Math.hypot(s.keyX, s.keyY, s.keyZ)).toBeCloseTo(1, 6);
      expect(s.keyY).toBeGreaterThan(0.5); // always a high, readable key light
      expect(s.keyZ).toBeGreaterThan(0); // from the camera side → shadows fall away from it
    }
    expect(lightingAt(485, 'clear').skyTop).not.toBe(lightingAt(315, 'clear').skyTop);
  });

  it('interpolates smoothly between keyframes (no jumps)', () => {
    for (let m = 300; m <= 500; m += 0.5) {
      const a = lightingAt(m, 'clear');
      const b = lightingAt(m + 0.5, 'clear');
      expect(Math.abs(brightness(a.skyTop) - brightness(b.skyTop))).toBeLessThan(0.05);
      expect(Math.abs(a.hemiIntensity - b.hemiIntensity)).toBeLessThan(0.05);
      expect(Math.abs(a.keyIntensity - b.keyIntensity)).toBeLessThan(0.15);
    }
  });

  it('moon hands over to the sun around 6:00 with an intensity dip', () => {
    const before = lightingAt(345, 'clear');
    const hand = lightingAt(362, 'clear');
    const after = lightingAt(380, 'clear');
    expect(hand.keyIntensity).toBeLessThan(before.keyIntensity);
    expect(hand.keyIntensity).toBeLessThan(after.keyIntensity);
    expect(before.sunAmount).toBeLessThan(0.01);
    expect(after.sunAmount).toBeGreaterThan(0.99);
  });

  it('the house warms up at 6:00 when the lights come on, then daylight takes over', () => {
    const quiet = lightingAt(330, 'clear').interiorWarm;
    const lightsOn = lightingAt(362, 'clear').interiorWarm;
    const morning = lightingAt(470, 'clear').interiorWarm;
    expect(quiet).toBeGreaterThan(0.1);
    expect(quiet).toBeLessThan(0.35);
    expect(lightsOn).toBeGreaterThan(0.7);
    expect(morning).toBeLessThan(0.05);
  });

  it('weather greys the sky and softens the sun; drizzle rains', () => {
    const c = lightingAt(450, 'clear');
    const cl = lightingAt(450, 'cloudy');
    const dr = lightingAt(450, 'drizzle');
    expect(cl.keyIntensity).toBeLessThan(c.keyIntensity);
    expect(dr.keyIntensity).toBeLessThan(cl.keyIntensity);
    expect(dr.rain).toBe(1);
    expect(c.rain).toBe(0);
    expect(cl.cloudAlpha).toBeGreaterThan(c.cloudAlpha);
  });

  it('writes into a provided state object (no allocation) and tolerates NaN', () => {
    const o = lightingAt(315, 'clear');
    const r = lightingAt(400, 'clear', o);
    expect(r).toBe(o);
    expect(lightingAt(Number.NaN, 'clear').minutes).toBe(315);
  });
});

describe('helpers', () => {
  it('mixHex / smooth01 / parseClock', () => {
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0x102030, 0x405060, 0)).toBe(0x102030);
    expect(mixHex(0x102030, 0x405060, 1)).toBe(0x405060);
    expect(smooth01(0, 1, -1)).toBe(0);
    expect(smooth01(0, 1, 0.5)).toBe(0.5);
    expect(smooth01(0, 1, 2)).toBe(1);
    expect(parseClock('5:15')).toBe(315);
    expect(parseClock('8:05')).toBe(485);
    expect(parseClock('420')).toBe(420);
    expect(parseClock('nope')).toBeNaN();
    expect(parseClock(null)).toBeNaN();
  });
});
