import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDesignSvg } from '../src/design-renderer.js';

const design = { dimensions: { width: 1024, height: 576 } };

test('renders exact headline and supporting copy as SVG text', () => {
  const svg = composeDesignSvg(new Uint8Array([1, 2, 3]), design,
    'Headline: "BUILD A BETTER WEBSITE" Supporting text: "WordPress and Shopify design"');
  assert.match(svg, /^<svg/);
  assert.match(svg, /BUILD A BETTER WEBSITE/);
  assert.match(svg, /WordPress and Shopify design/);
  assert.match(svg, /image\/png;base64,AQID/);
});

test('escapes user-supplied text before inserting it into SVG', () => {
  const svg = composeDesignSvg(new Uint8Array([1]), design,
    'Headline: "Design & <build> better"');
  assert.match(svg, /Design &amp; &lt;build&gt; better/);
  assert.doesNotMatch(svg, /<build>/);
});

test('does not add invented text when the brief has no labelled copy', () => {
  assert.equal(composeDesignSvg(new Uint8Array([1]), design, 'A premium abstract blue business graphic'), null);
});


test('uses structured copy fields and category-aware layout sizing', () => {
  const gig = composeDesignSvg(new Uint8Array([1, 2]), { category: 'fiverr', dimensions: { width: 1024, height: 576 } },
    'Create a Fiverr cover', { headline: 'WORDPRESS EXPERT', subline: 'Fast modern websites', cta: 'ORDER NOW', brandName: 'DARAPET' });
  assert.match(gig, /WORDPRESS EXPERT/);
  assert.match(gig, /DARAPET/);
  assert.match(gig, /ORDER NOW/);
  assert.match(gig, /font-size="80"/);
});

test('does not invent text when structured copy is empty', () => {
  assert.equal(composeDesignSvg(new Uint8Array([1]), design, 'Abstract blue artwork', {}), null);
});
