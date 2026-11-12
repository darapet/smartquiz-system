const CATEGORY_RULES = [
  { id: 'fiverr', terms: /\b(fiverr|gig cover|gig image|freelance marketplace)\b/i, ratio: 'landscape', canvas: 'Marketplace gig thumbnail: compact, bold, instantly readable at small size; one dominant service headline, one supporting line, one clear hero mockup; fill the canvas without browser chrome, navigation, footer, or website-hero whitespace.' },
  { id: 'youtube-thumbnail', terms: /\b(youtube thumbnail|video thumbnail|thumbnail)\b/i, ratio: 'landscape', canvas: 'YouTube thumbnail: high-impact editorial composition, one expressive focal subject, very large short headline, strong foreground/background separation, readable on a phone.' },
  { id: 'flyer', terms: /\b(flyer|promo(?:tional)? graphic|sale graphic|advert(?:isement)? poster)\b/i, ratio: 'portrait', canvas: 'Promotional flyer: clear headline-first hierarchy, event or product focal visual, compact details area, deliberate alignment, strong call to action, polished print-advertising composition.' },
  { id: 'event-poster', terms: /\b(event poster|concert poster|church poster|conference poster|worship poster)\b/i, ratio: 'portrait', canvas: 'Event poster: distinctive editorial art direction, dominant event title, one memorable visual concept, clear information hierarchy and balanced date/location details.' },
  { id: 'product-ad', terms: /\b(product ad|product advert|product advertisement|ecommerce ad|product promo)\b/i, ratio: 'square', canvas: 'Product advertising creative: hero product is dominant, premium studio lighting, refined material detail, concise benefit hierarchy and a strong commercial focal point.' },
  { id: 'social', terms: /\b(instagram|facebook|tiktok|social media|social post|instagram post)\b/i, ratio: 'square', canvas: 'Social campaign graphic: mobile-first hierarchy, strong focal point, bold concise headline, intentional safe margins and polished brand consistency.' },
  { id: 'banner', terms: /\b(banner|website header|web hero|hero section|website hero)\b/i, ratio: 'landscape', canvas: 'Wide advertising or website banner: clear focal subject, strong headline-safe area, refined depth and balanced horizontal composition.' },
  { id: 'logo', terms: /\b(logo|brand mark|brand identity|brand symbol)\b/i, ratio: 'square', canvas: 'Brand identity mark: distinctive simple silhouette, balanced geometry, considered negative space, clean edges and restrained presentation; avoid mockup clutter.' },
  { id: 'business-card', terms: /\b(business card|visiting card)\b/i, ratio: 'landscape', canvas: 'Business card: precise grid, restrained premium typography, clear contact hierarchy, elegant whitespace and print-ready front/back presentation.' },
  { id: 'menu', terms: /\b(menu|restaurant menu|cafe menu)\b/i, ratio: 'portrait', canvas: 'Restaurant menu: highly legible section hierarchy, elegant editorial typography, disciplined spacing and appetizing but restrained food imagery.' },
  { id: 'infographic', terms: /\b(infographic|data graphic|information graphic)\b/i, ratio: 'portrait', canvas: 'Infographic: structured information hierarchy, consistent visual language, clear chart/diagram zones, readable labels and disciplined spacing.' },
  { id: 'packaging', terms: /\b(packaging|product box|bottle label|label design|package design)\b/i, ratio: 'square', canvas: 'Packaging design: coherent brand system, convincing package form, premium material rendering, clear label hierarchy and realistic product presentation.' },
  { id: 'certificate', terms: /\b(certificate|award certificate|achievement certificate)\b/i, ratio: 'landscape', canvas: 'Certificate: formal symmetrical or grid-based layout, refined border treatment, clear recipient/title hierarchy and restrained ornament.' },
  { id: 'invitation', terms: /\b(invitation|wedding invite|birthday invite|invitation card)\b/i, ratio: 'portrait', canvas: 'Invitation: elegant event-specific art direction, graceful typography hierarchy, balanced details and tasteful decorative elements.' },
  { id: 'mockup', terms: /\b(mockup|device mockup|app mockup|website mockup)\b/i, ratio: 'landscape', canvas: 'Product mockup presentation: realistic perspective, clean studio lighting, accurate device/product proportions and uncluttered premium staging.' },
  { id: '3d-design', terms: /\b(3d|three dimensional|3-dimensional)\b/i, ratio: 'square', canvas: 'Premium 3D graphic: believable geometry and materials, controlled reflections, physically coherent lighting, dimensional depth and polished rendering.' },
  { id: '2d-design', terms: /\b(2d|two dimensional|flat illustration|vector illustration)\b/i, ratio: 'square', canvas: 'Premium 2D graphic: crisp vector-like forms, deliberate shape language, controlled palette, clean line work and precise visual balance.' },
];

const DEFAULT_CANVAS = {
  square: { width: 768, height: 768 },
  landscape: { width: 1024, height: 576 },
  portrait: { width: 576, height: 1024 },
};

export function directDesign(prompt, requestedCategory, requestedRatio) {
  const brief = String(prompt || '').replace(/\s+/g, ' ').trim();
  const requested = String(requestedCategory || '').toLowerCase().trim();
  const matched = CATEGORY_RULES.find((rule) => rule.id === requested)
    || CATEGORY_RULES.find((rule) => rule.terms.test(brief));
  const category = matched ? matched.id : (['logo', 'banner', 'flyer', 'poster', 'social', 'design'].includes(requested) ? requested : 'general');
  const ratio = matched && requestedRatio === 'square' ? matched.ratio
    : (['square', 'landscape', 'portrait'].includes(requestedRatio) ? requestedRatio : (matched ? matched.ratio : 'square'));
  const composition = matched ? matched.canvas : 'Create one coherent, professionally art-directed graphic composition with a clear focal point, intentional hierarchy, precise spacing and refined finish.';
  const style = /\b(3d|three dimensional|three-dimensional)\b/i.test(brief)
    ? 'Use a premium 3D visual language with believable materials, dimensional lighting and controlled reflections.'
    : /\b(2d|two dimensional|flat illustration|vector)\b/i.test(brief)
      ? 'Use a refined 2D visual language with crisp vector-like forms and a disciplined palette.'
      : 'Choose a visual style that best fits the audience, industry and purpose; avoid generic stock-template styling.';
  const promptText = [
    'You are art-directing a premium commercial graphic for a professional design studio.',
    composition,
    style,
    'Design quality: agency-level art direction, strong visual hierarchy, precise alignment, balanced negative space, deliberate typography scale, excellent contrast, sophisticated color harmony, polished lighting and clean finishing.',
    'Text policy: render only short, explicitly supplied wording; keep it large and correctly spelled. Do not invent prices, phone numbers, brand names or claims. If long copy cannot remain legible, prioritize the main headline and preserve clear space for later typesetting.',
    'Avoid: tiny text, random lettering, fake logos, watermarks, clutter, unrelated decorations, excessive empty space, generic website-hero layouts for non-banner work, malformed typography and unfinished artifacts.',
    'Client brief: "' + brief.replace(/["\\]/g, ' ') + '".',
  ].join(' ');
  return { category, aspectRatio: ratio, dimensions: DEFAULT_CANVAS[ratio], prompt: promptText };
}
