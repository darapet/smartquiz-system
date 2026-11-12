const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

function cleanCopy(copy, brief) {
  const source = copy && typeof copy === 'object' ? copy : {};
  const result = {};
  for (const key of ['headline', 'subline', 'cta', 'brandName', 'details']) {
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

export function composeDesignSvg(backgroundBytes, design, originalBrief, suppliedCopy) {
  const copy = cleanCopy(suppliedCopy, originalBrief);
  if (!Object.keys(copy).length) return null;
  const bytes = backgroundBytes instanceof Uint8Array ? backgroundBytes : new Uint8Array(backgroundBytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const base64 = btoa(binary);
  const width = design.dimensions.width;
  const height = design.dimensions.height;
  const category = String(design.category || 'general');
  const portrait = height > width;
  const compact = ['fiverr', 'youtube-thumbnail', 'social', 'product-ad'].includes(category);
  const formal = ['certificate', 'business-card', 'menu', 'invitation'].includes(category);
  const left = Math.round(width * (compact ? 0.055 : 0.075));
  const textWidth = Math.round(width * (compact ? 0.82 : 0.80));
  const headlineSize = Math.round(width * (compact ? 0.078 : portrait ? 0.072 : 0.064));
  const headlineLines = wrapWords(copy.headline || copy.brandName || '', Math.max(10, Math.round(textWidth / (headlineSize * 0.54))), compact ? 2 : 3);
  const headlineY = Math.round(height * (compact ? 0.72 : formal ? 0.25 : portrait ? 0.62 : 0.68));
  const subSize = Math.max(18, Math.round(width * (compact ? 0.027 : 0.026)));
  const subLines = wrapWords(copy.subline || copy.details || '', Math.max(18, Math.round(textWidth / (subSize * 0.53))), 2);
  const subY = headlineY + Math.max(1, headlineLines.length) * headlineSize * 1.02 + Math.round(height * 0.035);
  const brandY = Math.round(height * (formal ? 0.12 : 0.10));
  const ctaY = height - Math.round(height * 0.075);
  const headlineSvg = headlineLines.map((line, index) =>
    '<tspan x="' + left + '" dy="' + (index ? Math.round(headlineSize * 1.02) : 0) + '">' + escapeXml(line) + '</tspan>'
  ).join('');
  const subSvg = subLines.map((line, index) =>
    '<tspan x="' + left + '" dy="' + (index ? Math.round(subSize * 1.3) : 0) + '">' + escapeXml(line) + '</tspan>'
  ).join('');
  const brandSvg = copy.brandName && copy.headline
    ? '<text x="' + left + '" y="' + brandY + '" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="' + Math.round(width * 0.026) + '" font-weight="700" letter-spacing="1.4">' + escapeXml(copy.brandName) + '</text>' : '';
  const ctaWidth = Math.min(width * 0.48, Math.max(150, (copy.cta || '').length * subSize * 0.68 + 48));
  const textLayer = [
    '<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="' + (compact ? 0.38 : formal ? 0.22 : 0.32) + '" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="' + (formal ? '.62' : '.78') + '"/></linearGradient></defs>',
    '<rect width="100%" height="100%" fill="url(#shade)"/>',
    brandSvg,
    (copy.headline || copy.brandName) ? '<text x="' + left + '" y="' + headlineY + '" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="' + headlineSize + '" font-weight="900" letter-spacing="-1.1" paint-order="stroke" stroke="#000" stroke-opacity=".3" stroke-width="2">' + headlineSvg + '</text>' : '',
    subLines.length ? '<text x="' + left + '" y="' + subY + '" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="' + subSize + '" font-weight="600">' + subSvg + '</text>' : '',
    copy.cta ? '<g><rect x="' + left + '" y="' + (ctaY - subSize * 1.65) + '" width="' + ctaWidth + '" height="' + (subSize * 2.5) + '" rx="' + (formal ? 4 : subSize * 0.55) + '" fill="#fff"/><text x="' + (left + 20) + '" y="' + ctaY + '" fill="#171923" font-family="Arial,Helvetica,sans-serif" font-size="' + Math.round(subSize * 0.78) + '" font-weight="800">' + escapeXml(copy.cta) + '</text></g>' : '',
  ].join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><image width="' + width + '" height="' + height + '" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,' + base64 + '"/>' + textLayer + '</svg>';
}
