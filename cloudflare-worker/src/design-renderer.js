const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

function cleanCopy(copy, brief) {
  const source = copy && typeof copy === 'object' ? copy : {};
  const result = {};
  for (const key of ['headline', 'recipientName', 'subline', 'cta', 'brandName', 'details']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, key === 'headline' ? 100 : key === 'details' ? 240 : 120);
  }
  if (!Object.keys(result).length) {
    const text = String(brief || '');
    const patterns = [
      ['headline', /\b(?:headline|main headline|title)\s*[:=]\s*["“]([^"”]{2,90})["”]/i],
      ['subline', /\b(?:subheadline|subtitle|supporting text|subline)\s*[:=]\s*["“]([^"”]{2,110})["”]/i],
      ['cta', /\b(?:call to action|cta|button text)\s*[:=]\s*["“]([^"”]{2,45})["”]/i],
    ];
    for (const [key, pattern] of patterns) {
      const match = text.match(pattern);
      if (match) result[key] = match[1].trim();
    }
  }
  return result;
}

function wrapWords(value, maxChars, maxLines) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines.length - 1;
    lines[last] = lines[last].replace(/[.…]*$/, '') + '…';
  }
  return lines;
}

const RECIPES = {
  fiverr: { anchor: 'bottom', width: 0.88, headline: 0.092, subline: 0.030, shade: 0.76, maxLines: 2, align: 'start', inset: 0.055 },
  'youtube-thumbnail': { anchor: 'bottom', width: 0.88, headline: 0.105, subline: 0.032, shade: 0.78, maxLines: 2, align: 'start', inset: 0.055 },
  social: { anchor: 'bottom', width: 0.84, headline: 0.080, subline: 0.029, shade: 0.72, maxLines: 2, align: 'start', inset: 0.08 },
  'product-ad': { anchor: 'bottom', width: 0.82, headline: 0.074, subline: 0.027, shade: 0.70, maxLines: 2, align: 'start', inset: 0.075 },
  flyer: { anchor: 'lower', width: 0.84, headline: 0.070, subline: 0.026, shade: 0.78, maxLines: 3, align: 'start', inset: 0.08 },
  'event-poster': { anchor: 'lower', width: 0.84, headline: 0.070, subline: 0.026, shade: 0.78, maxLines: 3, align: 'start', inset: 0.08 },
  banner: { anchor: 'middle', width: 0.48, headline: 0.060, subline: 0.024, shade: 0.66, maxLines: 3, align: 'start', inset: 0.07 },
  logo: { anchor: 'middle', width: 0.84, headline: 0.075, subline: 0.022, shade: 0.36, maxLines: 2, align: 'center', inset: 0.08 },
  certificate: { anchor: 'middle', width: 0.78, headline: 0.060, subline: 0.023, shade: 0.60, maxLines: 3, align: 'center', inset: 0.11 },
  invitation: { anchor: 'lower', width: 0.80, headline: 0.065, subline: 0.023, shade: 0.66, maxLines: 3, align: 'center', inset: 0.10 },
  'business-card': { anchor: 'middle', width: 0.82, headline: 0.052, subline: 0.021, shade: 0.68, maxLines: 2, align: 'start', inset: 0.08 },
  menu: { anchor: 'lower', width: 0.84, headline: 0.060, subline: 0.023, shade: 0.76, maxLines: 3, align: 'start', inset: 0.08 },
  infographic: { anchor: 'top', width: 0.88, headline: 0.058, subline: 0.023, shade: 0.60, maxLines: 3, align: 'start', inset: 0.07 },
  packaging: { anchor: 'lower', width: 0.82, headline: 0.058, subline: 0.022, shade: 0.70, maxLines: 2, align: 'start', inset: 0.08 },
  mockup: { anchor: 'bottom', width: 0.78, headline: 0.052, subline: 0.022, shade: 0.64, maxLines: 2, align: 'start', inset: 0.08 },
};

function makeText(lines, x, y, size, anchor, weight, fill) {
  if (!lines.length) return '';
  const tspans = lines.map((line, index) =>
    '<tspan x="' + x + '" dy="' + (index ? Math.round(size * 1.08) : 0) + '">' + escapeXml(line) + '</tspan>'
  ).join('');
  return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" fill="' + fill + '" font-family="Arial,Helvetica,sans-serif" font-size="' + size + '" font-weight="' + weight + '" paint-order="stroke" stroke="#000" stroke-opacity=".22" stroke-width="2">' + tspans + '</text>';
}

export function composeDesignSvg(backgroundBytes, design, originalBrief, suppliedCopy) {
  const copy = cleanCopy(suppliedCopy, originalBrief);
  if (!Object.keys(copy).length) return null;
  const bytes = backgroundBytes instanceof Uint8Array ? backgroundBytes : new Uint8Array(backgroundBytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const base64 = btoa(binary);
  const width = Number(design?.dimensions?.width) || 1024;
  const height = Number(design?.dimensions?.height) || 576;

  const category = String(design.category || 'general');
  if (category === 'birthday') {
    const recipient = copy.recipientName || copy.headline || '';
    const nameSize = Math.max(42, Math.round(width * (height > width ? 0.105 : 0.092)));
    const labelSize = Math.max(22, Math.round(width * 0.036));
    const detailSize = Math.max(20, Math.round(width * 0.030));
    const centerX = Math.round(width / 2);
    const nameLines = wrapWords(recipient, Math.max(8, Math.floor(width * 0.82 / (nameSize * 0.54))), 2);
    const detailLines = wrapWords(copy.subline || copy.details || '', Math.max(18, Math.floor(width * 0.76 / (detailSize * 0.53))), 2);
    const centerY = Math.round(height * (height > width ? 0.51 : 0.55));
    const labelY = centerY - Math.round(nameSize * 1.55);
    const detailY = centerY + nameLines.length * nameSize * 1.08 + Math.round(height * 0.045);
    const frameInset = Math.round(Math.min(width, height) * 0.065);
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><image width="' + width + '" height="' + height + '" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,' + base64 + '"/><rect x="' + frameInset + '" y="' + frameInset + '" width="' + (width - frameInset * 2) + '" height="' + (height - frameInset * 2) + '" rx="' + Math.round(frameInset * 0.18) + '" fill="none" stroke="#d6ad58" stroke-width="' + Math.max(2, Math.round(width * 0.004)) + '" opacity=".88"/><circle cx="' + centerX + '" cy="' + Math.round(height * 0.19) + '" r="' + Math.round(width * 0.17) + '" fill="#d6ad58" opacity=".055"/><text x="' + centerX + '" y="' + labelY + '" text-anchor="middle" fill="#f4d58a" font-family="Georgia,serif" font-size="' + labelSize + '" font-weight="700" letter-spacing="' + Math.max(2, Math.round(width * 0.006)) + '">HAPPY BIRTHDAY TO</text>' + makeText(nameLines, centerX, centerY, nameSize, 'middle', 800, '#ffffff') + makeText(detailLines, centerX, detailY, detailSize, 'middle', 500, '#f7e9c8') + (copy.cta ? '<text x="' + centerX + '" y="' + Math.round(height * 0.88) + '" text-anchor="middle" fill="#e5c477" font-family="Arial,Helvetica,sans-serif" font-size="' + detailSize + '" font-weight="700">' + escapeXml(copy.cta) + '</text>' : '') + '</svg>';
  }
  const recipe = RECIPES[category] || {
    anchor: height > width ? 'lower' : 'bottom', width: 0.82,
    headline: height > width ? 0.068 : 0.062, subline: 0.024,
    shade: 0.72, maxLines: 3, align: 'start', inset: 0.075,
  };
  const left = Math.round(width * recipe.inset);
  const textWidth = Math.round(width * recipe.width);
  const anchor = recipe.align === 'center' ? 'middle' : 'start';
  const x = recipe.align === 'center' ? Math.round(width / 2) : left;
  const headlineSize = Math.max(24, Math.round(width * recipe.headline));
  const subSize = Math.max(18, Math.round(width * recipe.subline));
  const headline = wrapWords(copy.headline || copy.brandName || '', Math.max(8, Math.floor(textWidth / (headlineSize * 0.54))), recipe.maxLines);
  const supporting = wrapWords(copy.subline || copy.details || '', Math.max(14, Math.floor(textWidth / (subSize * 0.53))), 2);
  const brand = copy.brandName && copy.headline ? copy.brandName : '';
  const brandSize = Math.max(16, Math.round(width * 0.022));
  const brandY = Math.round(height * (recipe.anchor === 'top' ? 0.10 : recipe.anchor === 'middle' ? 0.30 : 0.12));
  let headlineY;
  if (recipe.anchor === 'top') headlineY = Math.round(height * 0.24);
  else if (recipe.anchor === 'middle') headlineY = Math.round(height * 0.52);
  else if (recipe.anchor === 'lower') headlineY = Math.round(height * (height > width ? 0.67 : 0.70));
  else headlineY = Math.round(height * 0.70);
  if (recipe.anchor === 'middle' && category === 'banner') headlineY = Math.round(height * 0.47);
  if (recipe.anchor === 'middle' && recipe.align === 'center') headlineY = Math.round(height * 0.54);
  const headlineHeight = headline.length * headlineSize * 1.08;
  const subY = headlineY + headlineHeight + Math.round(height * 0.035);
  const ctaY = height - Math.round(height * 0.075);
  const ctaFont = Math.max(16, Math.round(subSize * 0.82));
  const ctaWidth = Math.min(width * 0.46, Math.max(140, (copy.cta || '').length * ctaFont * 0.62 + 42));
  const shadeStart = recipe.anchor === 'top' ? 0 : recipe.anchor === 'middle' ? 0.18 : 0.34;
  const shade = '<defs><linearGradient id="xzilyShade" x1="0" y1="0" x2="0" y2="1"><stop offset="' + shadeStart + '" stop-color="#05070d" stop-opacity="0"/><stop offset="1" stop-color="#05070d" stop-opacity="' + recipe.shade + '"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#xzilyShade)"/>';
  const brandSvg = brand
    ? '<text x="' + x + '" y="' + brandY + '" text-anchor="' + anchor + '" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="' + brandSize + '" font-weight="700" letter-spacing="1.2">' + escapeXml(brand) + '</text>'
    : '';
  const headlineSvg = makeText(headline, x, headlineY, headlineSize, anchor, 900, '#fff');
  const subSvg = makeText(supporting, x, subY, subSize, anchor, 600, '#fff');
  const ctaX = recipe.align === 'center' ? Math.round((width - ctaWidth) / 2) : left;
  const ctaSvg = copy.cta
    ? '<g><rect x="' + ctaX + '" y="' + (ctaY - subSize * 1.55) + '" width="' + ctaWidth + '" height="' + (subSize * 2.25) + '" rx="' + (['certificate', 'business-card'].includes(category) ? 5 : 14) + '" fill="#fff"/><text x="' + (ctaX + 18) + '" y="' + ctaY + '" fill="#151923" font-family="Arial,Helvetica,sans-serif" font-size="' + ctaFont + '" font-weight="800">' + escapeXml(copy.cta) + '</text></g>'
    : '';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><image width="' + width + '" height="' + height + '" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,' + base64 + '"/>' + shade + brandSvg + headlineSvg + subSvg + ctaSvg + '</svg>';
  return svg;
}
