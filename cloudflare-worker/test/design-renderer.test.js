import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDesignSvg } from '../src/design-renderer.js';

const design = { category: 'general', dimensions: { width: 1024, height: 576 } };
const bytes = new Uint8Array([1, 2, 3]);

test('renders exact headline and supporting copy as SVG text', () => {
  const svg = composeDesignSvg(bytes, design,
    'Headline: "BUILD A BETTER WEBSITE" Supporting text: "WordPress and Shopify design"');
  assert.match(svg, /^<svg/);
  assert.match(svg, /BUILD A BETTER WEBSITE/);
  assert.match(svg, /WordPress and Shopify design/);
  assert.match(svg, /image\/png;base64,AQID/);
});

test('escapes user-supplied text before inserting it into SVG', () => {
  const svg = composeDesignSvg(bytes, design, 'Headline: "Design & <build> better"');
  assert.match(svg, /Design &amp; &lt;build&gt; better/);
  assert.doesNotMatch(svg, /<build>/);
});

test('does not add invented text when the brief has no labelled copy', () => {
  assert.equal(composeDesignSvg(bytes, design, 'A premium abstract blue business graphic'), null);
});

test('uses a compact, large-type Fiverr gig composition', () => {
  const svg = composeDesignSvg(bytes,
    { category: 'fiverr', dimensions: { width: 1024, height: 576 } },
    'Create a Fiverr cover',
    { headline: 'WORDPRESS EXPERT', subline: 'Fast modern websites', cta: 'ORDER NOW', brandName: 'DARAPET' });
  assert.match(svg, /WORDPRESS EXPERT/);
  assert.match(svg, /DARAPET/);
  assert.match(svg, /ORDER NOW/);
  assert.match(svg, /font-size="94"/);
});

test('uses a top-aligned information hierarchy for infographics', () => {
  const svg = composeDesignSvg(bytes,
    { category: 'infographic', dimensions: { width: 576, height: 1024 } },
    'Create an infographic',
    { headline: 'HOW THE WATER CYCLE WORKS', details: 'Evaporation, condensation and precipitation' });
  assert.match(svg, /HOW THE WATER CYCLE WORKS/);
  assert.match(svg, /Evaporation, condensation and precipitation/);
  assert.match(svg, /y="246"/);
});

test('centres formal certificate typography and preserves all supplied copy across wrapped lines', () => {
  const svg = composeDesignSvg(bytes,
    { category: 'certificate', dimensions: { width: 1024, height: 576 } },
    'Create certificate',
    { headline: 'CERTIFICATE OF COMPLETION', subline: 'Awarded to Jane Doe' });
  assert.match(svg, /text-anchor="middle"/);
  assert.match(svg, /CERTIFICATE OF/);
  assert.match(svg, /COMPLETION/);
  assert.match(svg, /Awarded to Jane Doe/);
});

test('does not invent text when structured copy is empty', () => {
  assert.equal(composeDesignSvg(bytes, design, 'Abstract blue artwork', {}), null);
});

test('escapes ampersands and quotes in all supplied copy fields', () => {
  const svg = composeDesignSvg(bytes,
    { category: 'banner', dimensions: { width: 1024, height: 576 } },
    'Create banner',
    { headline: 'Build & grow', subline: 'Quality "first"', cta: 'Let’s go' });
  assert.match(svg, /Build &amp; grow/);
  assert.match(svg, /Quality &quot;first&quot;/);
  assert.match(svg, /Let’s go/);
});
