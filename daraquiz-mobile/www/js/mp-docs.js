/* Reads text out of the files a host adds for the live multiplayer quiz.
   PDF, Word (.docx), PowerPoint (.pptx), plain text and images.
   Everything runs in the browser except picture reading, which the server does with an AI vision model. */

import { cleanText, SOURCE } from './mp-core.js';

export const DOC_LIMITS = Object.freeze({ maxFiles: 12, maxFileBytes: 30 * 1024 * 1024, maxPdfPages: 600, maxImageSide: 1800 });

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

const scripts = new Map();
function loadScript(url) {
  if (!scripts.has(url)) {
    scripts.set(url, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => resolve();
      el.onerror = () => { scripts.delete(url); reject(new Error('Could not load the file reader. Check your internet connection and try again.')); };
      document.head.appendChild(el);
    }));
  }
  return scripts.get(url);
}

const ext = name => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

export function kindOf(file) {
  const e = ext(file.name), t = String(file.type || '').toLowerCase();
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (e === 'pptx') return 'pptx';
  if (e === 'doc' || e === 'ppt') return 'old';
  if (['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'rtf', 'srt', 'vtt'].includes(e) || t.startsWith('text/')) return 'text';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(e) || /^image\/(png|jpeg|webp)$/.test(t)) return 'image';
  if (t.startsWith('image/') || ['gif', 'bmp', 'heic', 'heif', 'tif', 'tiff'].includes(e)) return 'badimage';
  return 'unknown';
}

const decodeXml = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');

/* Turns WordprocessingML or PresentationML into plain lines: one line per paragraph. */
export function xmlToText(xml, para) {
  return decodeXml(String(xml)
    .replace(new RegExp(`</${para}:p>`, 'g'), '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<(?:w:br|a:br)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<[^>]+>/g, ''));
}

async function readPdf(file, onProgress) {
  await loadScript(PDFJS_URL);
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('Could not load the PDF reader.');
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(pdf.numPages, DOC_LIMITS.maxPdfPages);
  const out = [];
  let thin = 0;
  for (let i = 1; i <= pages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let line = '', text = '';
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { text += `${line}\n`; line = ''; }
      else if (item.str && !/\s$/.test(item.str)) line += ' ';
    }
    text = cleanText(text + line);
    if (text.length < 25) thin++;
    out.push(text);
    if (onProgress && i % 5 === 0) onProgress(`Reading page ${i} of ${pages}…`);
  }
  const text = out.filter(Boolean).join('\n\n');
  if (text.length < 80 || thin > pages * 0.8) {
    throw new Error('This PDF looks scanned, so it has no text to read. Take a photo or screenshot of each page and add those as images instead.');
  }
  const note = pdf.numPages > pages ? ` (only the first ${pages} pages were read)` : '';
  return { text, note };
}

async function readZip(file) {
  await loadScript(JSZIP_URL);
  return window.JSZip.loadAsync(await file.arrayBuffer());
}

async function readDocx(file) {
  const zip = await readZip(file);
  const main = zip.file('word/document.xml');
  if (!main) throw new Error('This does not look like a Word (.docx) file.');
  let text = xmlToText(await main.async('string'), 'w');
  for (const name of Object.keys(zip.files).filter(n => /^word\/(footnotes|endnotes)\.xml$/.test(n))) {
    text += `\n\n${xmlToText(await zip.file(name).async('string'), 'w')}`;
  }
  return { text: cleanText(text), note: '' };
}

async function readPptx(file) {
  const zip = await readZip(file);
  const num = n => +(n.match(/(\d+)\.xml$/) || [0, 0])[1];
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
  if (!slides.length) throw new Error('This does not look like a PowerPoint (.pptx) file.');
  const parts = [];
  for (const name of slides) {
    const n = num(name);
    let t = xmlToText(await zip.file(name).async('string'), 'a');
    const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    if (notes) t += `\n${xmlToText(await notes.async('string'), 'a')}`;
    parts.push(`Slide ${n}\n${cleanText(t)}`);
  }
  return { text: cleanText(parts.join('\n\n')), note: '' };
}

async function readPlain(file) {
  let text = await file.text();
  const e = ext(file.name);
  if (e === 'html' || e === 'htm' || e === 'xml') text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h\d|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  if (e === 'rtf') text = text.replace(/\\par[d]?/g, '\n').replace(/\\'[0-9a-f]{2}/gi, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
  if (e === 'srt' || e === 'vtt') text = text.replace(/^\d+\s*$/gm, '').replace(/^[\d:.,\- >]+$/gm, '').replace(/^WEBVTT.*$/m, '');
  return { text: cleanText(decodeXml(text)), note: '' };
}

/* Shrinks a photo so it uploads quickly but stays sharp enough to read. */
async function imageToDataUrl(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('Could not open this image.');
  const fit = side => {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  let side = DOC_LIMITS.maxImageSide, quality = 0.85, url = '';
  for (let i = 0; i < 6; i++) {
    url = fit(side).toDataURL('image/jpeg', quality);
    if (url.length <= 1700000) break;
    side = Math.round(side * 0.8);
    quality = Math.max(0.6, quality - 0.05);
  }
  if (bitmap.close) bitmap.close();
  if (url.length > 1800000) throw new Error('That image is too large to read. Try a smaller photo.');
  return url;
}

/* `readImage(dataUrl)` is supplied by the page and asks the server to read the picture. */
async function readImage(file, readImage) {
  const url = await imageToDataUrl(file);
  const text = cleanText(await readImage(url));
  if (!text) throw new Error('No readable text was found in this image. Try a sharper, closer photo.');
  return { text, note: '' };
}

/* Reads one file. Returns { text, note }. Throws an Error with a message a host can act on. */
export async function readOne(file, { readImage: ocr, onProgress } = {}) {
  if (file.size > DOC_LIMITS.maxFileBytes) throw new Error('This file is larger than 30 MB.');
  if (!file.size) throw new Error('This file is empty.');
  const kind = kindOf(file);
  let r;
  if (kind === 'pdf') r = await readPdf(file, onProgress);
  else if (kind === 'docx') r = await readDocx(file);
  else if (kind === 'pptx') r = await readPptx(file);
  else if (kind === 'text') r = await readPlain(file);
  else if (kind === 'image') r = await readImage(file, ocr);
  else if (kind === 'old') throw new Error('Old .doc and .ppt files cannot be read. Save it as .docx, .pptx or PDF and add it again.');
  else if (kind === 'badimage') throw new Error('Use a PNG, JPG or WebP image.');
  else throw new Error('This file type is not supported. Use PDF, Word, PowerPoint, text or an image.');
  if (r.text.length < 20) throw new Error('No readable text was found in this file.');
  if (r.text.length > SOURCE.maxTotalChars) r = { text: r.text.slice(0, SOURCE.maxTotalChars), note: ' (very long, so only the first part was used)' };
  return r;
}
