const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

function extractCopy(brief) {
  const source = String(brief || '');
  const patterns = [
    ['headline', /\\b(?:headline|main headline|title)\\s*[:=]\\s*["“]([^"”]{2,90})["”]/i],
    ['subline', /\\b(?:subheadline|subtitle|supporting text|subline)\\s*[:=]\\s*["“]([^"”]{2,110})["”]/i],
    ['cta', /\\b(?:call to action|cta|button text)\\s*[:=]\\s*["“]([^"”]{2,45})["”]/i],
  ];
  const result = {};
  for (const [key, pattern] of patterns) {
    const match = source.match(pattern);
    if (match) result[key] = match[1].trim();
  }
  return result;
}

function wrapWords(value, maxChars, maxLines) {
  const words = String(value || '').trim().split(/\\s+/).filter(Boolean);
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

export function composeDesignSvg(backgroundBytes, design, originalBrief) {
  const copy = extractCopy(originalBrief);
  if (!copy.headline && !copy.subline && !copy.cta) return null;
  const bytes = backgroundBytes instanceof Uint8Array ? backgroundBytes : new Uint8Array(backgroundBytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const base64 = btoa(binary);
  const width = design.dimensions.width;
  const height = design.dimensions.height;
  const isPortrait = height > width;
  const left = Math.round(width * (isPortrait ? 0.075 : 0.065));
  const textWidth = Math.round(width * (isPortrait ? 0.82 : 0.72));
  const headlineSize = Math.round(width * (isPortrait ? 0.092 : 0.075));
  const headlineLines = wrapWords(copy.headline || '', Math.round(textWidth / (headlineSize * 0.54)), isPortrait ? 4 : 3);
  const headlineY = Math.round(height * (isPortrait ? 0.55 : 0.63));
  const headline = headlineLines.map((line, index) =>
    '<tspan x="' + left + '" dy="' + (index ? Math.round(headlineSize * 1.05) : 0) + '">' + escapeXml(line) + '</tspan>'
  ).join('');
  const subY = headlineY + Math.max(1, headlineLines.length) * headlineSize * 1.05 + Math.round(height * 0.035);
  const subSize = Math.round(width * 0.032);
  const ctaY = height - Math.round(height * 0.09);
  const textColor = '#ffffff';
  const textLayer = [
    '<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".38" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".76"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="5"/></filter></defs>',
    '<rect width="100%" height="100%" fill="url(#shade)"/>',
    copy.headline ? '<text x="' + left + '" y="' + headlineY + '" fill="' + textColor + '" font-family="Arial,Helvetica,sans-serif" font-size="' + headlineSize + '" font-weight="900" letter-spacing="-1.2" paint-order="stroke" stroke="#000" stroke-opacity=".28" stroke-width="2">' + headline + '</text>' : '',
    copy.subline ? '<text x="' + left + '" y="' + subY + '" fill="' + textColor + '" font-family="Arial,Helvetica,sans-serif" font-size="' + subSize + '" font-weight="600">' + escapeXml(copy.subline) + '</text>' : '',
    copy.cta ? '<g><rect x="' + left + '" y="' + (ctaY - subSize * 1.6) + '" width="' + Math.min(width * 0.48, copy.cta.length * subSize * 0.72 + 52) + '" height="' + (subSize * 2.5) + '" rx="' + (subSize * 0.55) + '" fill="#ffffff"/><text x="' + (left + 22) + '" y="' + ctaY + '" fill="#171923" font-family="Arial,Helvetica,sans-serif" font-size="' + subSize * 0.78 + '" font-weight="800">' + escapeXml(copy.cta) + '</text></g>' : '',
  ].join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><image width="' + width + '" height="' + height + '" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,' + base64 + '"/>' + textLayer + '</svg>';
}
