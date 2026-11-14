/* Studio AI Phase 2 — downloadable artifact engine. */
(function () {
'use strict';
var FORMATS = {
 docx:{label:'Word document',ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
 pdf:{label:'PDF document',ext:'pdf',mime:'application/pdf'},
 txt:{label:'text file',ext:'txt',mime:'text/plain;charset=utf-8'},
 csv:{label:'CSV file',ext:'csv',mime:'text/csv;charset=utf-8'},
 pptx:{label:'PowerPoint presentation',ext:'pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
 xlsx:{label:'Excel workbook',ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
};
function detectFormat(prompt){
 var p=String(prompt||'').toLowerCase();
 var asks=/\b(as|in|into|to|download|export|save|file|document|format|give me|provide|create|make|prepare|build|write|deliver|send me)\b/i.test(p);
 if(!asks)return null;
 if(/\b(docx|doc|word(?: document| file)?|microsoft word)\b/i.test(p))return'docx';
 if(/\bpdf\b/i.test(p))return'pdf';
 if(/\b(txt|text file|plain text)\b/i.test(p))return'txt';
 if(/\b(csv|comma[- ]separated)\b/i.test(p))return'csv';
 if(/\b(pptx|powerpoint|power point|slides|slide deck|presentation)\b/i.test(p))return'pptx';
 if(/\b(xlsx|excel|spreadsheet|workbook)\b/i.test(p))return'xlsx';
 return null;
}
function plainText(markdown){
 return String(markdown||'').replace(/\r/g,'')
 .replace(/\x60{3}[\s\S]*?\x60{3}/g,function(b){return b.replace(/^\x60{3}[^\n]*\n?/,'').replace(/\x60{3}$/,'');})
 .replace(/!\[([^\]]*)\]\([^)]+\)/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
 .replace(/^#{1,6}\s+/gm,'').replace(/^\s*>\s?/gm,'')
 .replace(/^\s*[-*+]\s+/gm,'• ').replace(/^\s*\d+[.)]\s+/gm,'• ')
 .replace(/(\*\*|__)(.*?)\1/g,'$2').replace(/(\*|_)(.*?)\1/g,'$2')
 .replace(/\x60([^\x60]+)\x60/g,'$1').trim();
}
function parseTable(markdown){
 var lines=String(markdown||'').split(/\r?\n/);
 for(var i=0;i<lines.length-1;i++){
  if(lines[i].indexOf('|')===-1||!/^\s*\|?\s*:?-{3,}/.test(lines[i+1]))continue;
  var rows=[];
  function cells(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return plainText(c).trim();});}
  rows.push(cells(lines[i]));i+=2;
  while(i<lines.length&&lines[i].indexOf('|')!==-1&&lines[i].trim())rows.push(cells(lines[i++]));
  if(rows.length>1)return rows;
 }
 return [['Content']].concat(plainText(markdown).split(/\n+/).filter(Boolean).map(function(line){return[line];}));
}
function formatOptions(prompt){
 var p=String(prompt||'');
 var font=(p.match(/\b(?:font|typeface)(?:\s+family)?\s*(?:of|:|=|to)?\s*["']?([^,;\n]+?)(?=\s+\d{1,2}\s*(?:pt|point)|[,;\n]|$)/i)||[])[1];
 if(!font)font=(p.match(/\b(Times New Roman|Arial|Calibri|Aptos|Cambria|Georgia|Verdana|Tahoma|Courier New)\s+font\b/i)||[])[1];
 var size=(p.match(/\b(\d{1,2})\s*(?:pt|point|points)\b/i)||[])[1];
 var line=(p.match(/\b(1(?:\.0|\.15|\.5|\.75)?|2(?:\.0)?)\s*(?:line\s*)?spacing\b/i)||[])[1];
 var margin=(p.match(/\b(\d+(?:\.\d+)?)\s*-?\s*(inch|inches|in|cm|mm)\s*margins?\b/i)||[]);
 var paper=/\bletter\b/i.test(p)?'letter':'a4';
 var fontName=font?font.trim():'Arial';
 if(/times/i.test(fontName))fontName='Times New Roman';
 else if(/arial|helvetica/i.test(fontName))fontName='Arial';
 return {
  font:fontName,
  fontSize:Math.max(8,Math.min(36,parseInt(size,10)||11)),
  lineSpacing:parseFloat(line)||1.15,
  marginValue:margin[1]?parseFloat(margin[1]):1,
  marginUnit:margin[2]||'inch',
  paper:paper,
  alignment:/\b(justified|justify)\b/i.test(p)?'JUSTIFIED':/\b(center|centred|centered)\b/i.test(p)?'CENTER':/\b(right[- ]aligned|align(?:ment)?\s+right)\b/i.test(p)?'RIGHT':'LEFT'
 };
}
function marginTwips(o){var n=o.marginValue;if(o.marginUnit==='cm')n*=567;else if(o.marginUnit==='mm')n*=56.7;else n*=1440;return Math.round(n);}
function parseBlocks(markdown){
 return String(markdown||'').replace(/\r/g,'').split('\n').map(function(line){
  var s=line.trim();if(!s)return{type:'space',text:''};
  var h=s.match(/^(#{1,3})\s+(.*)$/);if(h)return{type:'heading',level:h[1].length,text:plainText(h[2])};
  if(/^[-*+]\s+/.test(s))return{type:'bullet',text:plainText(s.replace(/^[-*+]\s+/,''))};
  if(/^\d+[.)]\s+/.test(s))return{type:'number',text:plainText(s.replace(/^\d+[.)]\s+/,''))};
  return{type:'paragraph',text:plainText(s)};
 });
}
function csvEscape(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
function safeFilename(prompt,ext){
 var title=(String(prompt||'').match(/(?:called|named|titled)\s+["“]?([^"”.,!?]+)["”]?/i)||[])[1];
 var base=(title||'Studio-AI-Output').trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,64);
 return(base||'Studio-AI-Output')+'.'+ext;
}
function loadLibrary(src,ready){
 return new Promise(function(resolve,reject){
  if(ready())return resolve();
  var old=document.querySelector('script[data-studio-artifact="'+src+'"]');
  if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',function(){reject(new Error('Document-generation library could not be loaded.'));},{once:true});return;}
  var s=document.createElement('script');s.src=src;s.async=true;s.dataset.studioArtifact=src;s.onload=resolve;s.onerror=function(){reject(new Error('Document-generation library could not be loaded.'));};document.head.appendChild(s);
 });
}
async function createArtifact(prompt,answer){
 var format=detectFormat(prompt);if(!format)throw new Error('No supported output format was requested.');
 var meta=FORMATS[format],name=safeFilename(prompt,meta.ext),opts=formatOptions(prompt),blob;
 if(format==='txt')blob=new Blob([plainText(answer)+'\n'],{type:meta.mime});
 else if(format==='csv')blob=new Blob([parseTable(answer).map(function(r){return r.map(csvEscape).join(',');}).join('\r\n')+'\r\n'],{type:meta.mime});
 else if(format==='xlsx'){
  await loadLibrary('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',function(){return!!window.XLSX;});
  var sheet=window.XLSX.utils.aoa_to_sheet(parseTable(answer)),book=window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(book,sheet,'Studio AI');blob=new Blob([window.XLSX.write(book,{bookType:'xlsx',type:'array'})],{type:meta.mime});
 }else if(format==='pptx'){
  await loadLibrary('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',function(){return!!window.PptxGenJS;});
  var pptx=new window.PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='Studio AI';pptx.subject='Generated by Studio AI';pptx.theme={headFontFace:opts.font,bodyFontFace:opts.font,lang:'en-US'};
  var blocks=parseBlocks(answer),slide=pptx.addSlide(),y=1.35;
  slide.addText('Studio AI Output',{x:.65,y:.45,w:12,h:.65,fontFace:opts.font,fontSize:26,bold:true,color:'17324D'});
  blocks.forEach(function(b){
   if(b.type==='space')return;
   if(b.type==='heading'&&y>5.7){slide=pptx.addSlide();y=.55;}
   if(b.type==='heading'){slide.addText(b.text,{x:.7,y:y,w:11.9,h:.42,fontFace:opts.font,fontSize:b.level===1?22:17,bold:true,color:'17324D'});y+=.55;}
   else{var value=(b.type==='bullet'?'• ':b.type==='number'?'– ':'')+b.text;slide.addText(value,{x:.85,y:y,w:11.5,h:.55,fontFace:opts.font,fontSize:opts.fontSize+2,color:'263746',valign:'mid',paraSpaceAfterPt:8});y+=.62;if(y>6.8){slide=pptx.addSlide();y=.55;}}
  });
  blob=await pptx.write({outputType:'blob'});
 }else if(format==='docx'){
  await loadLibrary('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',function(){return!!window.docx;});
  var d=window.docx,children=parseBlocks(answer).map(function(b){
   if(b.type==='space')return new d.Paragraph({children:[new d.TextRun(' ')]});
   var po={children:[new d.TextRun({text:b.text,font:opts.font,size:opts.fontSize*2})],spacing:{after:120,line:Math.round(240*opts.lineSpacing)}};
   if(b.type==='heading'){if(/^(translation|translated version|translated text)$/i.test(b.text))po.pageBreakBefore=true;po.alignment=opts.alignment==='CENTER'?d.AlignmentType.CENTER:opts.alignment==='RIGHT'?d.AlignmentType.RIGHT:opts.alignment==='JUSTIFIED'?d.AlignmentType.JUSTIFIED:d.AlignmentType.LEFT;po.heading=b.level===1?d.HeadingLevel.HEADING_1:b.level===2?d.HeadingLevel.HEADING_2:d.HeadingLevel.HEADING_3;po.spacing.before=180;}
   if(b.type!=='heading')po.alignment=opts.alignment==='CENTER'?d.AlignmentType.CENTER:opts.alignment==='RIGHT'?d.AlignmentType.RIGHT:opts.alignment==='JUSTIFIED'?d.AlignmentType.JUSTIFIED:d.AlignmentType.LEFT;if(b.type==='bullet')po.bullet={indent:360};if(b.type==='number')po.numbering={reference:'studio-list',level:0};return new d.Paragraph(po);
  });
  var m=marginTwips(opts),doc=new d.Document({numbering:{config:[{reference:'studio-list',levels:[{level:0,format:'decimal',text:'%1.',alignment:'start',style:{paragraph:{indent:{left:720,hanging:260}}}}]}]},sections:[{properties:{page:{size:opts.paper==='letter'?{width:12240,height:15840}:{width:11906,height:16838},margin:{top:m,right:m,bottom:m,left:m}}},children:children}]});
  blob=await d.Packer.toBlob(doc);
 }else if(format==='pdf'){
  await loadLibrary('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',function(){return!!(window.jspdf&&window.jspdf.jsPDF);});
  var fontStyle=/times/i.test(opts.font)?'times':/courier/i.test(opts.font)?'courier':'helvetica',pdf=new window.jspdf.jsPDF({unit:'pt',format:opts.paper,orientation:'portrait'});
  var mp=opts.marginUnit==='cm'?opts.marginValue*28.3465:opts.marginUnit==='mm'?opts.marginValue*2.83465:opts.marginValue*72,width=pdf.internal.pageSize.getWidth()-mp*2,yp=mp;
  pdf.setFont(fontStyle,'normal');pdf.setFontSize(opts.fontSize);
  parseBlocks(answer).forEach(function(b){
   if(b.type==='space'){yp+=opts.fontSize*.45;return;}
   var heading=b.type==='heading';if(heading&&/^(translation|translated version|translated text)$/i.test(b.text)&&yp>mp) { pdf.addPage(); yp=mp; }pdf.setFont(fontStyle,heading?'bold':'normal');pdf.setFontSize(heading?Math.min(24,opts.fontSize+(4-b.level)*2):opts.fontSize);
   var value=(b.type==='bullet'?'• ':b.type==='number'?'– ':'')+b.text;
   pdf.splitTextToSize(value,width).forEach(function(part){if(yp>pdf.internal.pageSize.getHeight()-mp){pdf.addPage();yp=mp;}var tx=opts.alignment==='CENTER'?mp+width/2:opts.alignment==='RIGHT'?mp+width:mp;pdf.text(part,tx,yp,{align:opts.alignment==='JUSTIFIED'?'justify':opts.alignment.toLowerCase()});yp+=opts.fontSize*opts.lineSpacing;});yp+=heading?7:3;
  });
  blob=pdf.output('blob');
 }
 if(!blob)throw new Error('The requested file could not be generated.');
 return{blob:blob,filename:name,format:format,label:meta.label,mime:meta.mime};
}
function attachDownload(file){
 var content=document.querySelector('#dts-messages .dts-message.dts-ai:last-child .dts-msg-content');if(!content)return;
 var wrap=document.createElement('div');wrap.className='dts-artifact-download-wrap';
 var link=document.createElement('a');link.className='dts-artifact-download-btn';link.href=URL.createObjectURL(file.blob);link.download=file.filename;link.textContent='↓ Download '+file.format.toUpperCase();link.setAttribute('role','button');link.setAttribute('aria-label','Download '+file.filename);wrap.appendChild(link);
 var label=document.createElement('div');label.className='dts-artifact-filename';label.textContent=file.filename;wrap.appendChild(label);content.appendChild(wrap);
 link.addEventListener('click',function(){setTimeout(function(){URL.revokeObjectURL(link.href);},60000);},{once:true});
}
window.dtsStudioArtifacts={detectFormat:detectFormat,create:createArtifact,attachDownload:attachDownload};
})();