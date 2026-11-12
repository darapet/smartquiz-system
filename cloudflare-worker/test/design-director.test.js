import test from 'node:test';
import assert from 'node:assert/strict';
import { directDesign } from '../src/design-director.js';

test('automatically detects Fiverr gig covers and uses a compact marketplace layout', () => {
  const result = directDesign('Create a premium Fiverr gig cover for WordPress website design', 'general', 'square');
  assert.equal(result.category, 'fiverr');
  assert.equal(result.aspectRatio, 'landscape');
  assert.match(result.prompt, /Marketplace gig thumbnail/);
  assert.match(result.prompt, /without browser chrome/);
});

test('detects product advertising and chooses a square composition', () => {
  const result = directDesign('Create a luxury skincare product advertisement', 'general', 'square');
  assert.equal(result.category, 'product-ad');
  assert.deepEqual(result.dimensions, { width: 768, height: 768 });
  assert.match(result.prompt, /hero product is dominant/);
});

test('detects 3D design language and applies professional visual direction', () => {
  const result = directDesign('Create a premium 3D gold logo for a technology company', 'general', 'square');
  assert.equal(result.category, 'logo');
  assert.match(result.prompt, /premium 3D visual language/);
});

test('respects an explicitly selected aspect ratio for a detected category', () => {
  const result = directDesign('Create an event flyer', 'general', 'landscape');
  assert.equal(result.category, 'flyer');
  assert.equal(result.aspectRatio, 'landscape');
  assert.deepEqual(result.dimensions, { width: 1024, height: 576 });
});

test('keeps unknown requests on a coherent general art direction', () => {
  const result = directDesign('A peaceful mountain landscape at sunrise', 'general', 'square');
  assert.equal(result.category, 'general');
  assert.match(result.prompt, /professionally art-directed graphic composition/);
});
