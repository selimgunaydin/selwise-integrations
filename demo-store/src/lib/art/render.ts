import { mix, isLight } from './color';
import { palette, TEMPLATES, type TemplateKey } from './templates';

export interface ArtInput {
  code: string;
  type: TemplateKey;
  colorHex: string;
  pattern?: 'stripe' | 'check' | 'dot';
  brand: string;
}

/** 1 = studio front, 2 = detail crop, 3 = lifestyle backdrop. */
export type ArtVariant = 1 | 2 | 3;

const PAPER = '#F3F0EB';

function backdrop(hex: string, variant: ArtVariant) {
  // A light product on a light tint disappears (white tee, white sneaker,
  // towels), so light colours get a fixed warm grey instead of their own tint.
  if (isLight(hex)) return variant === 2 ? '#E9E4DC' : variant === 3 ? '#DCD5CA' : '#E3DDD3';
  if (variant === 1) return mix(hex, PAPER, 0.86);
  if (variant === 2) return mix(hex, '#FFFFFF', 0.9);
  return '#E8E2D8';
}

export function renderProductSvg(input: ArtInput, variant: ArtVariant = 1): string {
  const tpl = TEMPLATES[input.type];
  const p = palette(input.colorHex);
  const body = tpl(p, { pattern: input.pattern ?? null, brand: input.brand.split(' ')[0] });
  const bg = backdrop(input.colorHex, variant);

  // Variant 2 zooms into the upper middle of the drawing; variant 3 sets it on
  // a "table" with a soft wall line, which is enough to read as a second shot.
  const transform =
    variant === 2 ? 'translate(-360 -300) scale(1.9)' : variant === 3 ? 'translate(60 70) scale(0.86)' : '';
  const scene =
    variant === 3
      ? `<rect x="0" y="700" width="800" height="300" fill="#DCD3C6"/><rect x="0" y="696" width="800" height="6" fill="#CFC5B6"/>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img">
<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter></defs>
<rect width="800" height="1000" fill="${bg}"/>
${scene}
<g transform="${transform}">${body}</g>
</svg>`;
}

/** A category / campaign tile: several products arranged on one canvas. */
export function renderCollage(items: ArtInput[], bg: string): string {
  const cells = items.slice(0, 3);
  const positions = [
    'translate(-40 120) scale(0.62)',
    'translate(250 40) scale(0.72)',
    'translate(520 160) scale(0.58)',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800" width="1000" height="800">
<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter></defs>
<rect width="1000" height="800" fill="${bg}"/>
${cells
  .map((it, i) => {
    const p = palette(it.colorHex);
    return `<g transform="${positions[i]}">${TEMPLATES[it.type](p, { pattern: it.pattern ?? null, brand: it.brand.split(' ')[0] })}</g>`;
  })
  .join('')}
</svg>`;
}
