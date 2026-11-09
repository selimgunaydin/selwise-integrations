'use strict';

const { goalBarViews, goalReachedReports, goalBarLook, HIDDEN_VIEW } = require('./goal-bar.js');
const { shouldRender } = require('./visibility.js');
const { setThemeTokens } = require('./styles.js');
const { loadSdkModule } = require('../test/sdk-source.js');

// The real SDK, from its source: what a bar says and when a step counts are
// the SDK's answers, and the overlay must be tested against them.
const { Selwise } = loadSdkModule('client.ts');
const { normalizeSurface } = loadSdkModule('core/surfaces.ts');
const { goalStepsCrossed } = loadSdkModule('core/goal-bar.ts');

const GOAL = normalizeSurface(
  {
    id: 'camp-goal',
    type: 'goal_bar',
    contentJson: {
      metric: 'cart_total',
      thresholds: [
        { at: 750, label: 'Ücretsiz kargo' },
        { at: 1500, label: 'Hediye çanta' },
      ],
      text: '{goal.label} için {goal.remaining} kaldı',
      buttonText: 'Alışverişe devam',
      buttonUrl: '/list/',
      completeText: 'Tebrikler, {goal.reachedLabel} kazandın!',
      completeButtonText: 'Ödemeye geç',
      completeButtonUrl: '/checkout/',
    },
    stylesJson: {
      backgroundColor: '#111111',
      textColor: '#ffffff',
      barTrackColor: '#333333',
      barFillColor: 'var(--selwise-brand, #d3145a)',
      barCompleteColor: '#16a34a',
      barHeight: '8px',
    },
    placementConfigJson: { position: 'bottom', placementType: 'fixed' },
  },
  'campaign'
);

const BANNER = normalizeSurface({ id: 'camp-bar', type: 'announcement_bar', contentJson: { text: 'x' } }, 'campaign');

function clientWithCart(total, itemCount) {
  const client = new Selwise();
  if (total !== undefined) client.setCart({ total, itemCount, currency: 'TRY' });
  return client;
}

const viewsFor = (client) => goalBarViews([GOAL, BANNER], (surface) => client.resolveGoalBar(surface, { locale: 'tr-TR' }));

describe('goalBarViews', () => {
  it('resolves only goal bars', () => {
    expect(Object.keys(viewsFor(clientWithCart(349, 2)))).toEqual(['camp-goal']);
  });

  // An unmeasured cart is never drawn — and never counted as seen.
  it('keeps the bar off screen until the app has measured the basket', () => {
    const view = viewsFor(clientWithCart())['camp-goal'];
    expect(view.visible).toBe(false);
    expect(shouldRender(GOAL, {}, { goalBarView: view })).toBe(false);
  });

  it('says the sentence for the basket', () => {
    const view = viewsFor(clientWithCart(349, 2))['camp-goal'];
    expect(view.visible).toBe(true);
    expect(view.text).toMatch(/^Ücretsiz kargo için .*401.* kaldı$/);
    expect(view.buttonUrl).toBe('/list/');
    expect(shouldRender(GOAL, {}, { goalBarView: view })).toBe(true);
  });

  it('switches button and link with the state', () => {
    const view = viewsFor(clientWithCart(1600, 5))['camp-goal'];
    expect(view.state).toBe('complete');
    expect(view.text).toBe('Tebrikler, Hediye çanta kazandın!');
    expect(view.buttonText).toBe('Ödemeye geç');
    expect(view.buttonUrl).toBe('/checkout/');
  });

  // An app on an SDK without the resolver has no honest sentence to draw.
  it('hides the bar without a resolver, or with a throwing one', () => {
    expect(goalBarViews([GOAL], null)['camp-goal']).toBe(HIDDEN_VIEW);
    expect(
      goalBarViews([GOAL], () => {
        throw new Error('old sdk');
      })['camp-goal']
    ).toBe(HIDDEN_VIEW);
  });

  it('keeps a bar with no view out of the overlay', () => {
    expect(shouldRender(GOAL, {}, {})).toBe(false);
    expect(shouldRender(GOAL, {})).toBe(false);
  });
});

/**
 * `goal_reached` is a step the basket passed WHILE the bar was on screen —
 * the browser widget's rule, run against the SDK's `goalStepsCrossed`.
 */
describe('goalReachedReports', () => {
  function step(remembered, client) {
    return goalReachedReports(remembered, [GOAL], viewsFor(client), goalStepsCrossed);
  }

  it('reports a step crossed on screen, once per crossing', () => {
    const client = clientWithCart(349, 2);
    let state = step({}, client);
    expect(state.reports).toEqual([]);

    client.setCart({ total: 800, itemCount: 3, currency: 'TRY' });
    state = step(state.remembered, client);
    expect(state.reports.map((report) => report.step)).toEqual([0]);

    // Nothing moved: nothing new.
    state = step(state.remembered, client);
    expect(state.reports).toEqual([]);
  });

  it('reports every step a single change jumps over', () => {
    const client = clientWithCart(349, 2);
    let state = step({}, client);
    client.setCart({ total: 1600, itemCount: 5, currency: 'TRY' });
    state = step(state.remembered, client);
    expect(state.reports.map((report) => report.step)).toEqual([0, 1]);
    expect(state.reports[0].surface).toBe(GOAL);
  });

  // A step already behind the shopper when the bar appeared was not reached
  // in front of it.
  it('does not report what was already reached when the bar first appeared', () => {
    expect(step({}, clientWithCart(900, 3)).reports).toEqual([]);
  });

  // A bar that was hidden (unknown cart) was in front of nobody.
  it('does not report a step crossed while the bar was hidden', () => {
    const client = clientWithCart();
    let state = step({}, client);
    client.setCart({ total: 900, itemCount: 3, currency: 'TRY' });
    state = step(state.remembered, client);
    expect(state.reports).toEqual([]);
  });

  // Coming back to a bar on a later screen starts fresh.
  it('forgets a bar that left the screen', () => {
    const client = clientWithCart(349, 2);
    const first = step({}, client);
    const away = goalReachedReports(first.remembered, [], {}, goalStepsCrossed);
    expect(away.remembered).toEqual({});

    client.setCart({ total: 800, itemCount: 3, currency: 'TRY' });
    expect(step(away.remembered, client).reports).toEqual([]);
  });

  it('reports nothing without the SDK rule', () => {
    const client = clientWithCart(349, 2);
    const first = step({}, client);
    client.setCart({ total: 800, itemCount: 3, currency: 'TRY' });
    expect(goalReachedReports(first.remembered, [GOAL], viewsFor(client), null).reports).toEqual([]);
  });
});

describe('goalBarLook', () => {
  afterEach(() => setThemeTokens({}));

  it('draws from the merchant styles, resolving the brand token', () => {
    setThemeTokens({ '--selwise-brand': '#ff0066' });
    const look = goalBarLook(GOAL, viewsFor(clientWithCart(349, 2))['camp-goal']);
    expect(look.fillColor).toBe('#ff0066');
    expect(look.trackColor).toBe('#333333');
    expect(look.barHeight).toBe(8);
    expect(look.percent).toBe(23);
    // One tick between the two steps; the last step is the end of the bar.
    expect(look.markers).toEqual([50]);
    expect(look.showBar).toBe(true);
    expect(look.showClose).toBe(false);
  });

  it('turns the fill to the completion colour once the goal is met', () => {
    const look = goalBarLook(GOAL, viewsFor(clientWithCart(1600, 5))['camp-goal']);
    expect(look.fillColor).toBe('#16a34a');
    expect(look.percent).toBe(100);
  });

  // The browser renderer's fallbacks: the button takes the text colour, its
  // label the background.
  it('falls back to the text and background colours for the button', () => {
    const look = goalBarLook(GOAL, viewsFor(clientWithCart(349, 2))['camp-goal']);
    expect(look.buttonStyles.buttonColor).toBe('#ffffff');
    expect(look.buttonStyles.buttonTextColor).toBe('#111111');
  });

  it('hides the bar when the merchant turned it off', () => {
    const noBar = Object.assign({}, GOAL, { content: Object.assign({}, GOAL.content, { showBar: false }) });
    expect(goalBarLook(noBar, viewsFor(clientWithCart(349, 2))['camp-goal']).showBar).toBe(false);
  });
});

/**
 * The overlay and the cart feed reach the SDK through a client instance and
 * through `require('@selwise/react-native')`, neither of which a type checker
 * sees. A misspelt method would sit behind a `typeof … === 'function'` guard
 * and silently do nothing — the `selwise.reset()` class of defect
 * `integration/analytics/index.spec.js` guards for the event mapping.
 */
describe('SDK contract for the overlay and the cart feed', () => {
  const fs = require('fs');
  const path = require('path');

  function calledClientMethods(file) {
    const source = fs
      .readFileSync(path.join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    return [...source.matchAll(/(?:client|selwise)\.([a-zA-Z]+)\(/g)].map((match) => match[1]);
  }

  it('calls only methods the SDK client has', () => {
    const available = new Set(Object.getOwnPropertyNames(Selwise.prototype));
    const called = [
      ...calledClientMethods('ui/SelwiseSurfaces.js'),
      ...calledClientMethods('integration/index.js'),
    ];
    expect(called).toEqual(expect.arrayContaining(['resolveGoalBar', 'trackGoalReached', 'onCartChange', 'setCart']));
    expect([...new Set(called)].filter((name) => !available.has(name))).toEqual([]);
  });

  it('uses only functions the SDK package exports', () => {
    const sdk = loadSdkModule('index.ts');
    expect(typeof sdk.countdownTarget).toBe('function');
    expect(typeof sdk.goalStepsCrossed).toBe('function');
  });
});
