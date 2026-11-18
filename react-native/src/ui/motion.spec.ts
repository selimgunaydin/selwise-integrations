import { entranceOf, slideDistance } from './motion.js';

describe('entranceOf', () => {
  it('slides the slide-in in from the edge its position names', () => {
    expect(entranceOf('slide_in', 'right', {})).toEqual({ kind: 'slide', from: 'right' });
    expect(entranceOf('slide_in', 'left', {})).toEqual({ kind: 'slide', from: 'left' });
    expect(entranceOf('slide_in', 'bottom', {})).toEqual({ kind: 'slide', from: 'bottom' });
  });

  it('follows the popup’s animation key, scale by default', () => {
    expect(entranceOf('exit_intent_popup', 'center', {})).toEqual({ kind: 'scale' });
    expect(entranceOf('exit_intent_popup', 'center', { animation: 'fade' })).toEqual({ kind: 'fade' });
    expect(entranceOf('exit_intent_popup', 'center', { animation: 'none' })).toEqual({ kind: 'none' });
    expect(entranceOf('exit_intent_popup', 'center', { animation: 'slide' })).toEqual({ kind: 'slide', from: 'bottom' });
  });

  it('fades a centred newsletter in and rises one the merchant put at the bottom', () => {
    expect(entranceOf('newsletter', 'center', {})).toEqual({ kind: 'fade' });
    expect(entranceOf('newsletter', 'bottom', {})).toEqual({ kind: 'slide', from: 'bottom' });
  });

  it('starts a slide a whole screen away', () => {
    const window = { width: 390, height: 844 };
    expect(slideDistance('right', window)).toBe(390);
    expect(slideDistance('left', window)).toBe(-390);
    expect(slideDistance('bottom', window)).toBe(844);
  });
});
