/**
 * Product illustrations, drawn as SVG.
 *
 * Every product in the demo catalogue gets its picture from one of these
 * templates, coloured with the product's own colour. They are deliberately
 * flat — one fill, one shade for depth, one highlight — so a grid of them reads
 * like a studio shoot rather than clip-art, and so a colour variant really
 * looks like the same product in another colour.
 *
 * Canvas: 800 × 1000 (4:5, the usual fashion card ratio). Apparel is drawn as
 * a flat lay (soft drop shadow), objects stand on a floor shadow.
 */
import { isLight, mix, shade } from './color';

export interface Palette {
  main: string;
  dark: string;
  darker: string;
  light: string;
  accent: string;
  accentDark: string;
  line: string;
  label: string;
}

export function palette(main: string, accent?: string): Palette {
  const acc = accent || (isLight(main) ? '#2B2A28' : '#F3EFE8');
  return {
    main,
    dark: shade(main, -0.14),
    darker: shade(main, -0.3),
    light: shade(main, 0.18),
    accent: acc,
    accentDark: shade(acc, -0.2),
    line: isLight(main) ? shade(main, -0.22) : shade(main, 0.16),
    label: isLight(main) ? '#2B2A28' : '#F7F3EC',
  };
}

export type Template = (p: Palette, opts: { pattern?: 'stripe' | 'check' | 'dot' | null; brand: string }) => string;

const floor = (cx = 400, cy = 880, rx = 230) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.round(rx * 0.12)}" fill="#000" opacity=".08"/>`;

/** Flat-lay drop shadow: the same path, offset and blurred. */
const flatShadow = (d: string) =>
  `<path d="${d}" fill="#000" opacity=".07" transform="translate(10 16)" filter="url(#soft)"/>`;

function patternOverlay(id: string, clipD: string, p: Palette, kind: 'stripe' | 'check' | 'dot' | null | undefined) {
  if (!kind) return '';
  const ink = p.accent;
  const defs =
    kind === 'stripe'
      ? `<pattern id="pt-${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="14" fill="${ink}" opacity=".85"/></pattern>`
      : kind === 'check'
        ? `<pattern id="pt-${id}" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="20" fill="${ink}" opacity=".35"/><rect width="20" height="60" fill="${ink}" opacity=".35"/></pattern>`
        : `<pattern id="pt-${id}" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="5" fill="${ink}" opacity=".8"/><circle cx="33" cy="33" r="5" fill="${ink}" opacity=".8"/></pattern>`;
  return `<defs>${defs}<clipPath id="cl-${id}"><path d="${clipD}"/></clipPath></defs><rect x="0" y="0" width="800" height="1000" fill="url(#pt-${id})" clip-path="url(#cl-${id})"/>`;
}

// ---------------------------------------------------------------- apparel

const TSHIRT =
  'M300 220 Q400 285 500 220 L612 262 L676 404 L586 444 L556 392 L556 812 Q400 832 244 812 L244 392 L214 444 L124 404 L188 262 Z';

const tshirt: Template = (p, o) => `
  ${flatShadow(TSHIRT)}
  <path d="${TSHIRT}" fill="${p.main}"/>
  ${patternOverlay('ts', TSHIRT, p, o.pattern)}
  <path d="M556 392 L556 812 Q520 818 486 820 L500 420 Z" fill="${p.dark}" opacity=".55"/>
  <path d="M300 220 Q400 285 500 220 Q400 262 300 220 Z" fill="${p.darker}"/>
  <path d="M300 220 Q400 300 500 220" fill="none" stroke="${p.line}" stroke-width="10"/>
  <path d="M214 444 L124 404 L136 378 L226 418 Z" fill="${p.dark}"/>
  <path d="M586 444 L676 404 L664 378 L574 418 Z" fill="${p.dark}"/>
  <path d="M250 800 Q400 820 550 800" fill="none" stroke="${p.line}" stroke-width="6" opacity=".7"/>`;

const SHIRT =
  'M310 205 L400 250 L490 205 L610 250 L700 720 L630 740 L556 420 L556 820 Q400 836 244 820 L244 420 L170 740 L100 720 L190 250 Z';
const shirt: Template = (p, o) => `
  ${flatShadow(SHIRT)}
  <path d="${SHIRT}" fill="${p.main}"/>
  ${patternOverlay('sh', SHIRT, p, o.pattern)}
  <path d="M556 420 L556 820 Q525 826 498 828 L512 440 Z" fill="${p.dark}" opacity=".5"/>
  <path d="M310 205 L400 250 L362 318 L300 236 Z" fill="${p.light}" stroke="${p.line}" stroke-width="4"/>
  <path d="M490 205 L400 250 L438 318 L500 236 Z" fill="${p.light}" stroke="${p.line}" stroke-width="4"/>
  <line x1="400" y1="252" x2="400" y2="826" stroke="${p.line}" stroke-width="5"/>
  ${[330, 420, 510, 600, 690, 780].map((y) => `<circle cx="414" cy="${y}" r="7" fill="${p.light}" stroke="${p.line}" stroke-width="3"/>`).join('')}
  <path d="M300 330 h70 v60 h-70 z" fill="none" stroke="${p.line}" stroke-width="4"/>
  <path d="M100 720 L170 740 L178 708 L108 690 Z" fill="${p.dark}"/>
  <path d="M700 720 L630 740 L622 708 L692 690 Z" fill="${p.dark}"/>`;

const KNIT =
  'M305 215 Q400 262 495 215 L615 258 Q680 470 706 742 L628 758 L560 430 L560 790 L240 790 L240 430 L172 758 L94 742 Q120 470 185 258 Z';
const knit: Template = (p, o) => `
  ${flatShadow(KNIT)}
  <path d="${KNIT}" fill="${p.main}"/>
  ${patternOverlay('kn', KNIT, p, o.pattern)}
  <path d="M560 430 L560 790 L500 790 L512 450 Z" fill="${p.dark}" opacity=".45"/>
  <path d="M305 215 Q400 262 495 215 L480 248 Q400 290 320 248 Z" fill="${p.dark}"/>
  ${Array.from({ length: 16 }, (_, i) => `<line x1="${250 + i * 20}" y1="790" x2="${250 + i * 20}" y2="840" stroke="${p.dark}" stroke-width="7"/>`).join('')}
  <rect x="240" y="788" width="320" height="56" fill="${p.dark}" opacity=".35"/>
  <path d="M94 742 L172 758 L164 800 L86 784 Z" fill="${p.dark}"/>
  <path d="M706 742 L628 758 L636 800 L714 784 Z" fill="${p.dark}"/>
  ${Array.from({ length: 9 }, (_, i) => `<path d="M${270 + i * 33} 300 v460" stroke="${p.line}" stroke-width="2" opacity=".35"/>`).join('')}`;

const HOODIE =
  'M300 250 Q290 140 400 130 Q510 140 500 250 L615 280 Q680 480 706 742 L628 758 L560 450 L560 800 L240 800 L240 450 L172 758 L94 742 Q120 480 185 280 Z';
const hoodie: Template = (p, o) => `
  ${flatShadow(HOODIE)}
  <path d="${HOODIE}" fill="${p.main}"/>
  ${patternOverlay('hd', HOODIE, p, o.pattern)}
  <path d="M330 250 Q330 170 400 165 Q470 170 470 250 Q400 300 330 250 Z" fill="${p.darker}"/>
  <path d="M560 450 L560 800 L505 800 L515 470 Z" fill="${p.dark}" opacity=".45"/>
  <line x1="372" y1="285" x2="366" y2="410" stroke="${p.accent}" stroke-width="7" stroke-linecap="round"/>
  <line x1="428" y1="285" x2="434" y2="410" stroke="${p.accent}" stroke-width="7" stroke-linecap="round"/>
  <path d="M300 590 L500 590 L540 720 L260 720 Z" fill="${p.dark}" opacity=".55"/>
  <rect x="240" y="790" width="320" height="50" rx="6" fill="${p.dark}"/>
  <path d="M94 742 L172 758 L164 798 L86 782 Z" fill="${p.dark}"/>
  <path d="M706 742 L628 758 L636 798 L714 782 Z" fill="${p.dark}"/>`;

const DRESS =
  'M330 170 L360 170 Q400 215 440 170 L470 170 L500 300 Q520 420 500 470 Q600 700 660 900 Q400 940 140 900 Q200 700 300 470 Q280 420 300 300 Z';
const dress: Template = (p, o) => `
  ${flatShadow(DRESS)}
  <path d="${DRESS}" fill="${p.main}"/>
  ${patternOverlay('dr', DRESS, p, o.pattern)}
  <path d="M500 470 Q600 700 660 900 Q600 912 540 918 Q500 700 440 480 Z" fill="${p.dark}" opacity=".45"/>
  <path d="M300 470 Q400 495 500 470" fill="none" stroke="${p.darker}" stroke-width="16"/>
  <path d="M360 170 Q400 215 440 170" fill="none" stroke="${p.line}" stroke-width="6"/>
  <defs><clipPath id="dress-clip"><path d="${DRESS}"/></clipPath></defs>
  <g clip-path="url(#dress-clip)">${[250, 330, 410, 490, 570].map((x) => `<path d="M${x + 60} 520 Q${x} 700 ${x - 30} 905" fill="none" stroke="${p.dark}" stroke-width="3" opacity=".5"/>`).join('')}</g>`;

const SKIRT = 'M270 230 L530 230 L548 290 Q640 600 690 860 Q400 900 110 860 Q160 600 252 290 Z';
const skirt: Template = (p, o) => `
  ${flatShadow(SKIRT)}
  <path d="${SKIRT}" fill="${p.main}"/>
  ${patternOverlay('sk', SKIRT, p, o.pattern)}
  <rect x="262" y="226" width="276" height="64" rx="6" fill="${p.darker}"/>
  <circle cx="400" cy="258" r="11" fill="${p.light}"/>
  ${[200, 300, 400, 500, 600].map((x) => `<path d="M${400 + (x - 400) * 0.35} 300 Q${x} 600 ${x + (x - 400) * 0.2} 870" fill="none" stroke="${p.dark}" stroke-width="4" opacity=".5"/>`).join('')}`;

const PANTS =
  'M262 160 L538 160 L560 260 L600 900 L450 912 L404 360 L396 360 L350 912 L200 900 L240 260 Z';
const pants: Template = (p, o) => `
  ${flatShadow(PANTS)}
  <path d="${PANTS}" fill="${p.main}"/>
  ${patternOverlay('pa', PANTS, p, o.pattern)}
  <rect x="258" y="150" width="284" height="50" rx="4" fill="${p.dark}"/>
  ${[290, 360, 440, 510].map((x) => `<rect x="${x}" y="146" width="12" height="58" rx="3" fill="${p.darker}"/>`).join('')}
  <path d="M400 200 L400 330" stroke="${p.line}" stroke-width="5"/>
  <path d="M272 210 Q300 280 350 240" fill="none" stroke="${p.line}" stroke-width="4"/>
  <path d="M528 210 Q500 280 450 240" fill="none" stroke="${p.line}" stroke-width="4"/>
  <path d="M560 260 L600 900 L540 905 L520 300 Z" fill="${p.dark}" opacity=".45"/>
  <path d="M300 420 L330 880" stroke="${p.dark}" stroke-width="3" opacity=".5"/>
  <path d="M500 420 L470 880" stroke="${p.dark}" stroke-width="3" opacity=".5"/>`;

const JEANS_STITCH = (p: Palette) => `
  <path d="M272 214 Q300 286 352 244" fill="none" stroke="#E2B04A" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="M528 214 Q500 286 448 244" fill="none" stroke="#E2B04A" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="M410 205 Q420 300 400 340" fill="none" stroke="#E2B04A" stroke-width="4" stroke-dasharray="10 8"/>
  <circle cx="400" cy="176" r="10" fill="#C9A75B" stroke="${p.darker}" stroke-width="2"/>`;
const jeans: Template = (p, o) => pants(p, o) + JEANS_STITCH(p);

const SHORTS = 'M252 260 L548 260 L572 340 L612 620 L452 640 L404 430 L396 430 L348 640 L188 620 L228 340 Z';
const shorts: Template = (p, o) => `
  ${flatShadow(SHORTS)}
  <path d="${SHORTS}" fill="${p.main}"/>
  ${patternOverlay('so', SHORTS, p, o.pattern)}
  <rect x="248" y="252" width="304" height="52" rx="4" fill="${p.dark}"/>
  <line x1="372" y1="300" x2="366" y2="370" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
  <line x1="428" y1="300" x2="434" y2="370" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
  <path d="M572 340 L612 620 L560 628 L540 360 Z" fill="${p.dark}" opacity=".45"/>`;

const JACKET =
  'M300 190 L400 236 L500 190 L630 240 Q690 480 716 780 L636 796 L572 440 L572 860 L228 860 L228 440 L164 796 L84 780 Q110 480 170 240 Z';
const jacket: Template = (p, o) => `
  ${flatShadow(JACKET)}
  <path d="${JACKET}" fill="${p.main}"/>
  ${patternOverlay('ja', JACKET, p, o.pattern)}
  <path d="M572 440 L572 860 L510 860 L520 460 Z" fill="${p.dark}" opacity=".5"/>
  <path d="M300 190 L400 236 L372 420 L290 300 Z" fill="${p.dark}"/>
  <path d="M500 190 L400 236 L428 420 L510 300 Z" fill="${p.dark}"/>
  <path d="M400 236 L400 860" stroke="${p.darker}" stroke-width="6"/>
  ${[480, 580, 680].map((y) => `<circle cx="426" cy="${y}" r="10" fill="${p.accent}"/>`).join('')}
  <path d="M260 640 h100" stroke="${p.darker}" stroke-width="6"/>
  <path d="M440 640 h100" stroke="${p.darker}" stroke-width="6"/>
  <path d="M84 780 L164 796 L158 836 L78 820 Z" fill="${p.dark}"/>
  <path d="M716 780 L636 796 L642 836 L722 820 Z" fill="${p.dark}"/>`;

const COAT =
  'M300 170 L400 216 L500 170 L630 220 Q690 480 716 800 L636 816 L578 440 L590 930 L210 930 L222 440 L164 816 L84 800 Q110 480 170 220 Z';
const coat: Template = (p, o) => `
  ${flatShadow(COAT)}
  <path d="${COAT}" fill="${p.main}"/>
  ${patternOverlay('co', COAT, p, o.pattern)}
  <path d="M578 440 L590 930 L520 930 L522 460 Z" fill="${p.dark}" opacity=".5"/>
  <path d="M300 170 L400 216 L360 470 L270 300 Z" fill="${p.dark}"/>
  <path d="M500 170 L400 216 L440 470 L530 300 Z" fill="${p.dark}"/>
  <path d="M400 216 L400 930" stroke="${p.darker}" stroke-width="6"/>
  ${[520, 640, 760].map((y) => `<circle cx="372" cy="${y}" r="11" fill="${p.darker}"/><circle cx="428" cy="${y}" r="11" fill="${p.darker}"/>`).join('')}
  <rect x="226" y="560" width="300" height="26" fill="${p.darker}" opacity=".6"/>
  <path d="M84 800 L164 816 L158 856 L78 840 Z" fill="${p.dark}"/>
  <path d="M716 800 L636 816 L642 856 L722 840 Z" fill="${p.dark}"/>`;

const LEGGINGS = 'M290 170 L510 170 L520 260 L548 900 L446 908 L404 340 L396 340 L354 908 L252 900 L280 260 Z';
const leggings: Template = (p, o) => `
  ${flatShadow(LEGGINGS)}
  <path d="${LEGGINGS}" fill="${p.main}"/>
  ${patternOverlay('le', LEGGINGS, p, o.pattern)}
  <rect x="286" y="166" width="228" height="64" rx="8" fill="${p.dark}"/>
  <path d="M292 250 L266 892" stroke="${p.accent}" stroke-width="12" opacity=".9"/>
  <path d="M508 250 L534 892" stroke="${p.accent}" stroke-width="12" opacity=".9"/>`;

const BRA = 'M250 330 Q260 250 330 240 L360 300 Q400 330 440 300 L470 240 Q540 250 550 330 L560 560 L240 560 Z';
const sportsBra: Template = (p, o) => `
  ${flatShadow(BRA)}
  <path d="${BRA}" fill="${p.main}"/>
  ${patternOverlay('br', BRA, p, o.pattern)}
  <path d="M300 250 L330 140" stroke="${p.main}" stroke-width="38" stroke-linecap="round"/>
  <path d="M500 250 L470 140" stroke="${p.main}" stroke-width="38" stroke-linecap="round"/>
  <path d="M260 420 Q330 360 400 420 Q470 360 540 420" fill="none" stroke="${p.dark}" stroke-width="6"/>
  <rect x="238" y="500" width="324" height="64" rx="8" fill="${p.accent}"/>
  <text x="400" y="545" text-anchor="middle" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="${p.label === '#2B2A28' ? '#F7F3EC' : '#2B2A28'}">${'ACTIVE'}</text>`;

// ---------------------------------------------------------------- shoes

const sneaker: Template = (p) => `
  ${floor(400, 760, 300)}
  <path d="M110 700 Q100 600 170 560 L330 470 Q380 440 420 480 Q520 560 640 580 Q712 592 712 660 L712 700 Z" fill="${p.main}"/>
  <path d="M330 470 Q380 440 420 480 Q520 560 640 580 Q712 592 712 660 L520 640 Q420 600 330 470 Z" fill="${p.dark}" opacity=".35"/>
  <path d="M96 690 L716 690 Q724 740 690 752 L140 752 Q96 746 96 690 Z" fill="#F4F2EE" stroke="#D9D4CB" stroke-width="4"/>
  <path d="M110 724 L700 724" stroke="#D9D4CB" stroke-width="4"/>
  <path d="M230 640 Q380 560 560 620" fill="none" stroke="${p.accent}" stroke-width="22" stroke-linecap="round"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M${352 + i * 34} ${492 + i * 22} l40 -28" stroke="${p.light}" stroke-width="9" stroke-linecap="round"/>`).join('')}
  <path d="M120 600 Q140 560 180 548" fill="none" stroke="${p.darker}" stroke-width="8"/>
  <circle cx="160" cy="640" r="8" fill="${p.darker}"/>`;

const boot: Template = (p) => `
  ${floor(400, 800, 260)}
  <path d="M240 260 L420 260 L430 560 Q520 600 620 640 Q680 660 680 720 L680 760 L230 760 Z" fill="${p.main}"/>
  <path d="M420 260 L430 560 Q520 600 620 640 Q680 660 680 720 L520 700 Q430 660 380 600 L370 260 Z" fill="${p.dark}" opacity=".35"/>
  <rect x="226" y="752" width="460" height="34" rx="8" fill="${p.darker}"/>
  <rect x="226" y="752" width="130" height="62" rx="6" fill="${p.darker}"/>
  <rect x="236" y="250" width="190" height="32" rx="8" fill="${p.dark}"/>
  <path d="M260 320 L260 700" stroke="${p.line}" stroke-width="5" stroke-dasharray="14 10"/>
  <rect x="370" y="300" width="30" height="210" rx="10" fill="${p.accent}" opacity=".85"/>`;

const sandal: Template = (p) => `
  ${floor(400, 760, 280)}
  <path d="M130 700 Q120 660 170 650 L640 640 Q700 640 700 690 L700 712 Q700 740 660 740 L170 740 Q130 740 130 700 Z" fill="#C9A27A"/>
  <path d="M130 712 L700 712 L700 730 Q700 752 660 752 L170 752 Q130 752 130 730 Z" fill="${p.darker}"/>
  <path d="M260 650 Q300 520 380 520 Q460 520 500 646" fill="none" stroke="${p.main}" stroke-width="44"/>
  <path d="M520 646 Q560 560 640 560" fill="none" stroke="${p.main}" stroke-width="36"/>
  <circle cx="640" cy="560" r="18" fill="${p.accent}"/>`;

const loafer: Template = (p) => `
  ${floor(400, 760, 290)}
  <path d="M120 700 Q110 610 190 590 L420 560 Q560 540 660 600 Q712 630 708 700 Z" fill="${p.main}"/>
  <path d="M420 560 Q560 540 660 600 Q712 630 708 700 L520 680 Q440 640 420 560 Z" fill="${p.dark}" opacity=".35"/>
  <path d="M110 696 L716 696 Q716 744 680 748 L150 748 Q110 744 110 696 Z" fill="${p.darker}"/>
  <path d="M430 600 Q520 590 600 620" fill="none" stroke="${p.darker}" stroke-width="16"/>
  <rect x="470" y="596" width="70" height="20" rx="6" fill="${p.accent}"/>`;

// ---------------------------------------------------------------- bags & accessories

const tote: Template = (p, o) => `
  ${floor(400, 860, 250)}
  <path d="M300 360 Q300 170 400 170 Q500 170 500 360" fill="none" stroke="${p.darker}" stroke-width="22"/>
  <path d="M190 340 L610 340 L650 840 L150 840 Z" fill="${p.main}"/>
  ${patternOverlay('to', 'M190 340 L610 340 L650 840 L150 840 Z', p, o.pattern)}
  <path d="M610 340 L650 840 L560 840 L540 340 Z" fill="${p.dark}" opacity=".4"/>
  <rect x="190" y="340" width="420" height="40" fill="${p.dark}" opacity=".5"/>
  <text x="400" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="46" letter-spacing="8" fill="${p.label}" opacity=".85">${o.brand.toUpperCase()}</text>`;

const handbag: Template = (p) => `
  ${floor(400, 840, 240)}
  <path d="M290 420 Q290 240 400 240 Q510 240 510 420" fill="none" stroke="${p.darker}" stroke-width="26"/>
  <path d="M170 420 Q170 380 210 380 L590 380 Q630 380 630 420 L650 780 Q650 820 610 820 L190 820 Q150 820 150 780 Z" fill="${p.main}"/>
  <path d="M630 420 L650 780 Q650 820 610 820 L560 820 L560 380 L590 380 Q630 380 630 420 Z" fill="${p.dark}" opacity=".4"/>
  <path d="M170 400 L630 400 L610 560 Q400 620 190 560 Z" fill="${p.dark}"/>
  <rect x="372" y="560" width="56" height="46" rx="8" fill="#C9A75B" stroke="#9C7F3E" stroke-width="4"/>`;

const backpack: Template = (p) => `
  ${floor(400, 880, 220)}
  <path d="M330 230 Q330 150 400 150 Q470 150 470 230" fill="none" stroke="${p.darker}" stroke-width="20"/>
  <rect x="210" y="220" width="380" height="640" rx="120" fill="${p.main}"/>
  <path d="M590 340 L590 740 Q590 860 470 860 L520 860 Q560 600 520 230 Q590 260 590 340 Z" fill="${p.dark}" opacity=".4"/>
  <rect x="260" y="560" width="280" height="250" rx="40" fill="${p.dark}"/>
  <path d="M260 600 L540 600" stroke="${p.accent}" stroke-width="8"/>
  <rect x="380" y="590" width="40" height="22" rx="6" fill="${p.accent}"/>
  <path d="M230 330 Q400 380 570 330" fill="none" stroke="${p.darker}" stroke-width="8"/>`;

const wallet: Template = (p) => `
  ${floor(400, 760, 230)}
  <rect x="180" y="400" width="440" height="320" rx="22" fill="${p.main}"/>
  <rect x="180" y="400" width="440" height="160" rx="22" fill="${p.dark}"/>
  <path d="M180 540 L620 540" stroke="${p.line}" stroke-width="5" stroke-dasharray="12 8"/>
  <rect x="540" y="500" width="110" height="80" rx="16" fill="${p.darker}"/>
  <circle cx="610" cy="540" r="12" fill="#C9A75B"/>
  <rect x="230" y="600" width="200" height="16" rx="8" fill="${p.light}" opacity=".7"/>`;

const watch: Template = (p) => `
  ${floor(400, 900, 160)}
  <rect x="330" y="80" width="140" height="300" rx="30" fill="${p.main}"/>
  <rect x="330" y="620" width="140" height="300" rx="30" fill="${p.main}"/>
  ${[160, 220, 700, 760, 820].map((y) => `<rect x="380" y="${y}" width="40" height="12" rx="6" fill="${p.dark}"/>`).join('')}
  <circle cx="400" cy="500" r="168" fill="${p.accent === '#2B2A28' ? '#C9A75B' : '#C0C0C0'}"/>
  <circle cx="400" cy="500" r="146" fill="#FBFAF7"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return `<line x1="${400 + Math.sin(a) * 120}" y1="${500 - Math.cos(a) * 120}" x2="${400 + Math.sin(a) * 134}" y2="${500 - Math.cos(a) * 134}" stroke="#2B2A28" stroke-width="${i % 3 === 0 ? 8 : 4}"/>`;
  }).join('')}
  <line x1="400" y1="500" x2="460" y2="440" stroke="#2B2A28" stroke-width="10" stroke-linecap="round"/>
  <line x1="400" y1="500" x2="400" y2="400" stroke="#2B2A28" stroke-width="6" stroke-linecap="round"/>
  <circle cx="400" cy="500" r="12" fill="${p.main}"/>
  <rect x="566" y="480" width="26" height="40" rx="6" fill="#B9B5AE"/>`;

const sunglasses: Template = (p) => `
  ${floor(400, 700, 260)}
  <path d="M120 420 L80 400" stroke="${p.darker}" stroke-width="18" stroke-linecap="round"/>
  <path d="M680 420 L720 400" stroke="${p.darker}" stroke-width="18" stroke-linecap="round"/>
  <path d="M110 430 Q110 400 150 400 L340 400 Q370 400 366 440 Q350 600 240 600 Q130 600 110 430 Z" fill="${p.main}"/>
  <path d="M690 430 Q690 400 650 400 L460 400 Q430 400 434 440 Q450 600 560 600 Q670 600 690 430 Z" fill="${p.main}"/>
  <path d="M136 440 Q140 420 168 420 L330 420 Q346 420 344 444 Q330 576 240 576 Q150 576 136 440 Z" fill="#2E3A44"/>
  <path d="M664 440 Q660 420 632 420 L470 420 Q454 420 456 444 Q470 576 560 576 Q650 576 664 440 Z" fill="#2E3A44"/>
  <path d="M170 450 L250 450" stroke="#fff" stroke-width="10" opacity=".25" stroke-linecap="round"/>
  <path d="M500 450 L580 450" stroke="#fff" stroke-width="10" opacity=".25" stroke-linecap="round"/>
  <path d="M366 430 Q400 400 434 430" fill="none" stroke="${p.main}" stroke-width="22"/>`;

const cap: Template = (p) => `
  ${floor(400, 760, 260)}
  <path d="M190 600 Q180 330 400 320 Q620 330 610 600 Z" fill="${p.main}"/>
  <path d="M400 320 Q620 330 610 600 L500 600 Q520 420 400 320 Z" fill="${p.dark}" opacity=".4"/>
  <path d="M180 600 L620 600 Q720 610 730 650 Q640 680 400 670 L180 640 Z" fill="${p.darker}"/>
  <path d="M400 320 L400 600" stroke="${p.line}" stroke-width="5"/>
  <circle cx="400" cy="322" r="16" fill="${p.dark}"/>
  <rect x="330" y="470" width="140" height="56" rx="8" fill="${p.accent}" opacity=".9"/>`;

const beanie: Template = (p) => `
  ${floor(400, 800, 220)}
  <path d="M210 620 Q190 330 400 320 Q610 330 590 620 Z" fill="${p.main}"/>
  ${Array.from({ length: 10 }, (_, i) => `<path d="M${240 + i * 36} 600 Q${244 + i * 36} 420 ${300 + i * 22} 340" fill="none" stroke="${p.dark}" stroke-width="5" opacity=".6"/>`).join('')}
  <rect x="190" y="600" width="420" height="140" rx="30" fill="${p.dark}"/>
  ${Array.from({ length: 13 }, (_, i) => `<line x1="${215 + i * 30}" y1="612" x2="${215 + i * 30}" y2="728" stroke="${p.darker}" stroke-width="7"/>`).join('')}
  <circle cx="400" cy="300" r="62" fill="${p.light}"/>`;

const belt: Template = (p) => `
  ${floor(400, 720, 300)}
  <path d="M90 500 Q400 420 710 500 L710 570 Q400 490 90 570 Z" fill="${p.main}"/>
  <path d="M90 545 Q400 465 710 545" stroke="${p.line}" stroke-width="3" stroke-dasharray="10 8" fill="none"/>
  <rect x="290" y="440" width="120" height="120" rx="16" fill="none" stroke="#C9A75B" stroke-width="18"/>
  <line x1="350" y1="450" x2="350" y2="550" stroke="#C9A75B" stroke-width="10"/>
  ${[520, 580, 640].map((x) => `<circle cx="${x}" cy="${510 - (x - 400) * 0.05}" r="9" fill="${p.darker}"/>`).join('')}`;

const scarf: Template = (p, o) => `
  ${floor(400, 860, 240)}
  <path d="M240 200 L560 200 Q600 400 520 520 L600 820 L460 840 L400 560 L340 840 L200 820 L280 520 Q200 400 240 200 Z" fill="${p.main}"/>
  ${patternOverlay('sc', 'M240 200 L560 200 Q600 400 520 520 L600 820 L460 840 L400 560 L340 840 L200 820 L280 520 Q200 400 240 200 Z', p, o.pattern ?? 'check')}
  <path d="M280 520 Q400 600 520 520 L500 470 Q400 540 300 470 Z" fill="${p.dark}"/>
  ${Array.from({ length: 8 }, (_, i) => `<line x1="${210 + i * 17}" y1="${822 + i * 2}" x2="${206 + i * 17}" y2="${870 + i * 2}" stroke="${p.dark}" stroke-width="6"/>`).join('')}
  ${Array.from({ length: 8 }, (_, i) => `<line x1="${466 + i * 17}" y1="${840 - i * 2}" x2="${470 + i * 17}" y2="${888 - i * 2}" stroke="${p.dark}" stroke-width="6"/>`).join('')}`;

// ---------------------------------------------------------------- beauty

const lipstick: Template = (p) => `
  ${floor(400, 880, 150)}
  <rect x="310" y="560" width="180" height="320" rx="14" fill="#1F1F1F"/>
  <rect x="310" y="560" width="180" height="40" fill="#C9A75B"/>
  <rect x="330" y="400" width="140" height="170" rx="8" fill="#C9A75B"/>
  <path d="M350 400 L350 250 Q350 190 450 160 L450 400 Z" fill="${p.main}"/>
  <path d="M420 400 L420 175 Q440 166 450 160 L450 400 Z" fill="${p.dark}"/>
  <text x="400" y="760" text-anchor="middle" font-family="Georgia, serif" font-size="28" letter-spacing="4" fill="#E9E1D3">ARDISA</text>`;

const foundation: Template = (p) => `
  ${floor(400, 880, 170)}
  <rect x="380" y="220" width="40" height="120" fill="#2B2A28"/>
  <path d="M330 230 L470 230 L470 250 L420 250 L420 270 L380 270 L380 250 L330 250 Z" fill="#2B2A28"/>
  <rect x="290" y="340" width="220" height="80" rx="6" fill="#2B2A28"/>
  <path d="M270 420 L530 420 Q560 420 560 460 L560 840 Q560 880 520 880 L280 880 Q240 880 240 840 L240 460 Q240 420 270 420 Z" fill="${p.main}" opacity=".95"/>
  <path d="M500 440 Q540 450 540 500 L540 840 Q540 860 520 862 L500 862 Z" fill="#fff" opacity=".25"/>
  <rect x="280" y="600" width="240" height="140" fill="#FBFAF7" opacity=".9"/>
  <text x="400" y="664" text-anchor="middle" font-family="Georgia, serif" font-size="30" letter-spacing="5" fill="#2B2A28">ARDISA</text>
  <text x="400" y="710" text-anchor="middle" font-family="Helvetica, Arial" font-size="20" letter-spacing="3" fill="#6B675F">SKIN TINT</text>`;

const mascara: Template = (p) => `
  ${floor(400, 880, 150)}
  <rect x="350" y="120" width="100" height="330" rx="18" fill="#1F1F1F"/>
  <rect x="350" y="430" width="100" height="30" fill="#C9A75B"/>
  <rect x="340" y="460" width="120" height="420" rx="24" fill="${p.main}"/>
  <path d="M440 480 Q456 490 456 520 L456 850 Q456 870 440 872 Z" fill="#fff" opacity=".2"/>
  <text x="400" y="700" text-anchor="middle" font-family="Georgia, serif" font-size="26" letter-spacing="4" fill="${p.label}" transform="rotate(-90 400 700)">ARDISA LASH</text>`;

const palette9: Template = (p) => `
  ${floor(400, 800, 280)}
  <rect x="140" y="300" width="520" height="440" rx="30" fill="#2B2A28"/>
  <rect x="166" y="326" width="468" height="388" rx="18" fill="#3A3835"/>
  ${[0, 1, 2]
    .flatMap((r) =>
      [0, 1, 2].map((c) => {
        const t = (r * 3 + c) / 8;
        const col = c === 1 && r === 1 ? p.main : mix(p.light, p.darker, t);
        return `<rect x="${196 + c * 142}" y="${352 + r * 118}" width="122" height="98" rx="14" fill="${col}"/>`;
      }),
    )
    .join('')}`;

const creamJar: Template = (p) => `
  ${floor(400, 860, 230)}
  <rect x="190" y="460" width="420" height="400" rx="40" fill="#FBFAF7"/>
  <path d="M560 470 Q600 480 600 540 L600 820 Q600 852 570 856 L560 856 Z" fill="#000" opacity=".06"/>
  <rect x="180" y="380" width="440" height="110" rx="20" fill="${p.main}"/>
  <rect x="180" y="460" width="440" height="20" fill="${p.dark}"/>
  <rect x="230" y="600" width="340" height="160" fill="${p.main}" opacity=".18"/>
  <text x="400" y="670" text-anchor="middle" font-family="Georgia, serif" font-size="38" letter-spacing="6" fill="#2B2A28">ARDISA</text>
  <text x="400" y="720" text-anchor="middle" font-family="Helvetica, Arial" font-size="20" letter-spacing="4" fill="#6B675F">MOISTURE CREAM</text>`;

const serum: Template = (p) => `
  ${floor(400, 880, 150)}
  <ellipse cx="400" cy="210" rx="44" ry="70" fill="#2B2A28"/>
  <rect x="356" y="250" width="88" height="140" rx="8" fill="#2B2A28"/>
  <rect x="300" y="380" width="200" height="500" rx="26" fill="${p.main}" opacity=".9"/>
  <rect x="300" y="560" width="200" height="320" rx="0" fill="${p.dark}" opacity=".35"/>
  <rect x="320" y="470" width="160" height="200" fill="#FBFAF7" opacity=".92"/>
  <text x="400" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="26" letter-spacing="4" fill="#2B2A28">ARDISA</text>
  <text x="400" y="600" text-anchor="middle" font-family="Helvetica, Arial" font-size="17" letter-spacing="3" fill="#6B675F">SERUM</text>`;

const perfume: Template = (p) => `
  ${floor(400, 880, 200)}
  <rect x="340" y="180" width="120" height="120" rx="10" fill="#C9A75B"/>
  <rect x="370" y="290" width="60" height="50" fill="#B9B5AE"/>
  <path d="M250 340 L550 340 L600 420 L600 840 Q600 880 560 880 L240 880 Q200 880 200 840 L200 420 Z" fill="${p.main}" opacity=".85"/>
  <path d="M250 360 L330 360 L280 860 L230 860 Q220 860 220 840 L220 430 Z" fill="#fff" opacity=".22"/>
  <rect x="280" y="560" width="240" height="120" fill="#FBFAF7" opacity=".9"/>
  <text x="400" y="616" text-anchor="middle" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="#2B2A28">ARDISA</text>
  <text x="400" y="654" text-anchor="middle" font-family="Helvetica, Arial" font-size="18" letter-spacing="3" fill="#6B675F">EAU DE PARFUM</text>`;

const shampoo: Template = (p) => `
  ${floor(400, 890, 170)}
  <rect x="350" y="150" width="100" height="90" rx="12" fill="${p.darker}"/>
  <path d="M290 240 L510 240 Q560 260 560 330 L560 860 Q560 890 530 890 L270 890 Q240 890 240 860 L240 330 Q240 260 290 240 Z" fill="${p.main}"/>
  <path d="M520 270 Q540 300 540 340 L540 860 Q540 872 528 874 L500 874 L500 260 Z" fill="${p.dark}" opacity=".4"/>
  <rect x="270" y="470" width="260" height="230" fill="#FBFAF7" opacity=".9"/>
  <text x="400" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="32" letter-spacing="5" fill="#2B2A28">ARDISA</text>
  <text x="400" y="606" text-anchor="middle" font-family="Helvetica, Arial" font-size="18" letter-spacing="3" fill="#6B675F">HAIR CARE</text>`;

// ---------------------------------------------------------------- home

const candle: Template = (p) => `
  ${floor(400, 860, 200)}
  <path d="M400 330 Q372 380 400 420 Q428 380 400 330 Z" fill="#F2B544"/>
  <path d="M400 360 Q388 390 400 412 Q412 390 400 360 Z" fill="#FBE3A6"/>
  <line x1="400" y1="420" x2="400" y2="452" stroke="#2B2A28" stroke-width="5"/>
  <rect x="240" y="440" width="320" height="420" rx="34" fill="${p.main}" opacity=".88"/>
  <rect x="256" y="450" width="288" height="44" rx="12" fill="#F7F1E4"/>
  <rect x="270" y="600" width="260" height="160" fill="#FBFAF7" opacity=".92"/>
  <text x="400" y="670" text-anchor="middle" font-family="Georgia, serif" font-size="34" letter-spacing="6" fill="#2B2A28">ARDISA</text>
  <text x="400" y="716" text-anchor="middle" font-family="Helvetica, Arial" font-size="18" letter-spacing="3" fill="#6B675F">HOME CANDLE</text>`;

const mug: Template = (p) => `
  ${floor(380, 830, 230)}
  <path d="M560 480 Q680 480 680 590 Q680 700 560 700" fill="none" stroke="${p.main}" stroke-width="44"/>
  <path d="M200 400 L580 400 L560 800 Q556 830 520 830 L260 830 Q224 830 220 800 Z" fill="${p.main}"/>
  <path d="M520 400 L580 400 L560 800 Q556 830 520 830 L500 830 Z" fill="${p.dark}" opacity=".4"/>
  <ellipse cx="390" cy="400" rx="190" ry="34" fill="${p.dark}"/>
  <ellipse cx="390" cy="404" rx="168" ry="24" fill="#4A2F22"/>
  ${[330, 390, 450].map((x) => `<path d="M${x} 330 Q${x - 20} 290 ${x} 250 Q${x + 20} 210 ${x} 170" fill="none" stroke="#B9B5AE" stroke-width="8" stroke-linecap="round" opacity=".7"/>`).join('')}`;

const plates: Template = (p) => `
  ${floor(400, 760, 290)}
  ${[0, 1, 2, 3].map((i) => `<ellipse cx="400" cy="${700 - i * 40}" rx="${280 - i * 6}" ry="64" fill="${i % 2 ? p.light : p.main}" stroke="${p.dark}" stroke-width="4"/>`).join('')}
  <ellipse cx="400" cy="580" rx="190" ry="40" fill="${p.light}" stroke="${p.dark}" stroke-width="3"/>
  <ellipse cx="400" cy="580" rx="230" ry="50" fill="none" stroke="${p.accent}" stroke-width="5" opacity=".6"/>`;

const cushion: Template = (p, o) => `
  ${floor(400, 860, 260)}
  <path d="M150 240 Q400 290 650 240 Q610 500 650 760 Q400 710 150 760 Q190 500 150 240 Z" fill="${p.main}"/>
  ${patternOverlay('cu', 'M150 240 Q400 290 650 240 Q610 500 650 760 Q400 710 150 760 Q190 500 150 240 Z', p, o.pattern)}
  <path d="M650 240 Q610 500 650 760 Q600 740 560 740 Q590 500 560 270 Z" fill="${p.dark}" opacity=".4"/>
  <path d="M150 240 Q400 290 650 240" fill="none" stroke="${p.darker}" stroke-width="6"/>
  <path d="M150 760 Q400 710 650 760" fill="none" stroke="${p.darker}" stroke-width="6"/>`;

const blanket: Template = (p, o) => `
  ${floor(400, 840, 300)}
  <rect x="130" y="380" width="540" height="420" rx="40" fill="${p.main}"/>
  ${patternOverlay('bl', 'M130 380 h540 v420 h-540 z', p, o.pattern ?? 'stripe')}
  <path d="M130 520 Q400 560 670 520 L670 600 Q400 640 130 600 Z" fill="${p.dark}" opacity=".5"/>
  ${Array.from({ length: 16 }, (_, i) => `<line x1="${150 + i * 33}" y1="800" x2="${150 + i * 33}" y2="850" stroke="${p.dark}" stroke-width="7"/>`).join('')}`;

const towel: Template = (p) => `
  ${floor(400, 860, 260)}
  ${[0, 1, 2].map((i) => `<rect x="${180 + i * 10}" y="${700 - i * 150}" width="${440 - i * 20}" height="140" rx="40" fill="${i === 1 ? p.light : p.main}"/><rect x="${180 + i * 10}" y="${740 - i * 150}" width="${440 - i * 20}" height="20" fill="${p.dark}" opacity=".5"/>`).join('')}`;

const lamp: Template = (p) => `
  ${floor(400, 880, 200)}
  <path d="M250 200 L550 200 L640 470 L160 470 Z" fill="${p.main}"/>
  <path d="M480 200 L550 200 L640 470 L560 470 Z" fill="${p.dark}" opacity=".35"/>
  <rect x="380" y="470" width="40" height="300" fill="#C9A75B"/>
  <path d="M260 880 Q260 780 400 770 Q540 780 540 880 Z" fill="${p.darker}"/>
  <ellipse cx="400" cy="470" rx="240" ry="20" fill="#FBE9B8" opacity=".9"/>`;

const plant: Template = (p) => `
  ${floor(400, 880, 200)}
  ${[
    'M400 520 Q300 380 250 260 Q360 300 410 500',
    'M400 520 Q500 360 560 250 Q450 290 390 500',
    'M400 520 Q380 330 400 160 Q440 330 410 520',
    'M400 520 Q260 470 180 430 Q300 420 400 500',
    'M400 520 Q540 470 620 420 Q500 410 400 500',
  ]
    .map((d, i) => `<path d="${d}" fill="${i % 2 ? '#4E7D58' : '#3E6B4B'}"/>`)
    .join('')}
  <path d="M250 520 L550 520 L510 870 Q506 890 480 890 L320 890 Q294 890 290 870 Z" fill="${p.main}"/>
  <path d="M480 520 L550 520 L510 870 Q506 890 480 890 L460 890 Z" fill="${p.dark}" opacity=".4"/>
  <rect x="236" y="505" width="328" height="44" rx="10" fill="${p.dark}"/>`;

const vase: Template = (p) => `
  ${floor(400, 880, 180)}
  <path d="M380 420 Q340 260 300 150" stroke="#6B7F5A" stroke-width="7" fill="none"/>
  <path d="M410 420 Q430 240 470 120" stroke="#6B7F5A" stroke-width="7" fill="none"/>
  <circle cx="300" cy="150" r="34" fill="${p.accent === '#2B2A28' ? '#D98C7A' : '#E8C547'}"/>
  <circle cx="470" cy="120" r="30" fill="#E7D7C9"/>
  <path d="M350 420 L450 420 L450 470 Q590 560 560 760 Q540 880 400 880 Q260 880 240 760 Q210 560 350 470 Z" fill="${p.main}"/>
  <path d="M450 470 Q590 560 560 760 Q540 880 420 880 Q520 760 470 520 Z" fill="${p.dark}" opacity=".4"/>
  <ellipse cx="400" cy="420" rx="52" ry="12" fill="${p.darker}"/>`;

// ---------------------------------------------------------------- sport

const yogaMat: Template = (p) => `
  ${floor(400, 860, 300)}
  <rect x="160" y="300" width="480" height="420" rx="30" fill="${p.main}" transform="rotate(-8 400 510)"/>
  <circle cx="560" cy="700" r="130" fill="${p.dark}"/>
  <circle cx="560" cy="700" r="100" fill="${p.main}"/>
  <circle cx="560" cy="700" r="70" fill="${p.dark}"/>
  <circle cx="560" cy="700" r="40" fill="${p.main}"/>
  <path d="M500 590 L700 640" stroke="${p.accent}" stroke-width="16"/>`;

const bottle: Template = (p) => `
  ${floor(400, 890, 160)}
  <rect x="350" y="120" width="100" height="80" rx="16" fill="${p.darker}"/>
  <path d="M430 150 Q520 150 520 230" fill="none" stroke="${p.darker}" stroke-width="16"/>
  <rect x="330" y="190" width="140" height="60" rx="10" fill="${p.darker}"/>
  <rect x="300" y="240" width="200" height="650" rx="60" fill="${p.main}"/>
  <path d="M460 260 Q500 280 500 340 L500 830 Q500 880 460 886 Z" fill="${p.dark}" opacity=".35"/>
  <rect x="300" y="520" width="200" height="90" fill="${p.accent}" opacity=".9"/>
  <text x="400" y="578" text-anchor="middle" font-family="Georgia, serif" font-size="30" letter-spacing="5" fill="${isLight(p.accent) ? '#2B2A28' : '#F7F3EC'}">ARDISA</text>`;

const dumbbell: Template = (p) => `
  ${floor(400, 760, 300)}
  <rect x="250" y="600" width="300" height="44" rx="12" fill="#B9B5AE"/>
  <rect x="140" y="510" width="130" height="220" rx="30" fill="${p.main}"/>
  <rect x="530" y="510" width="130" height="220" rx="30" fill="${p.main}"/>
  <rect x="140" y="510" width="40" height="220" rx="16" fill="${p.dark}"/>
  <rect x="620" y="510" width="40" height="220" rx="16" fill="${p.dark}"/>`;

export const TEMPLATES = {
  tshirt,
  shirt,
  knit,
  hoodie,
  dress,
  skirt,
  pants,
  jeans,
  shorts,
  jacket,
  coat,
  leggings,
  sportsBra,
  sneaker,
  boot,
  sandal,
  loafer,
  tote,
  handbag,
  backpack,
  wallet,
  watch,
  sunglasses,
  cap,
  beanie,
  belt,
  scarf,
  lipstick,
  foundation,
  mascara,
  palette9,
  creamJar,
  serum,
  perfume,
  shampoo,
  candle,
  mug,
  plates,
  cushion,
  blanket,
  towel,
  lamp,
  plant,
  vase,
  yogaMat,
  bottle,
  dumbbell,
} satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;
