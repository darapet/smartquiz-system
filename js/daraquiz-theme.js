(function(){
'use strict';
var KEY='daraquiz.theme.v1';
var DEFAULTS={primary:'#2457d6',secondary:'#7657d5',accent:'#19a7d8',background:'#f4f7fc',surface:'#ffffff',header:'#ffffff',border:'#dfe7f2',button:'#2457d6',text:'#17243a',muted:'#66758c',fontSize:16,fontFamily:'Inter',lineHeight:1.55,density:'comfortable',radius:'soft'};
function cleanHex(v,fallback){var s=String(v||'').trim();return /^#[0-9a-f]{6}$/i.test(s)?s:fallback;}
function normalize(raw){raw=raw&&typeof raw==='object'?raw:{};return {
primary:cleanHex(raw.primary,DEFAULTS.primary),secondary:cleanHex(raw.secondary,DEFAULTS.secondary),accent:cleanHex(raw.accent,DEFAULTS.accent),
background:cleanHex(raw.background,DEFAULTS.background),surface:cleanHex(raw.surface,DEFAULTS.surface),header:cleanHex(raw.header,DEFAULTS.header),border:cleanHex(raw.border,DEFAULTS.border),button:cleanHex(raw.button,DEFAULTS.button),text:cleanHex(raw.text,DEFAULTS.text),muted:cleanHex(raw.muted,DEFAULTS.muted),
fontSize:Math.max(14,Math.min(20,Number(raw.fontSize)||DEFAULTS.fontSize)),fontFamily:['Inter','system','Georgia'].includes(raw.fontFamily)?raw.fontFamily:DEFAULTS.fontFamily,lineHeight:Math.max(1.35,Math.min(1.9,Number(raw.lineHeight)||DEFAULTS.lineHeight)),
density:['compact','comfortable','spacious'].includes(raw.density)?raw.density:DEFAULTS.density,
radius:['soft','rounded','sharp'].includes(raw.radius)?raw.radius:DEFAULTS.radius
};}
function apply(raw){var t=normalize(raw),r=document.documentElement.style;
r.setProperty('--dq-primary',t.primary);r.setProperty('--dq-primary-strong',t.primary);r.setProperty('--dq-primary-soft',t.primary+'18');
r.setProperty('--dq-secondary',t.secondary);r.setProperty('--dq-accent',t.accent);r.setProperty('--dq-bg',t.background);r.setProperty('--dq-surface',t.surface);
r.setProperty('--dq-header',t.header);r.setProperty('--dq-border',t.border);r.setProperty('--dq-button',t.button);r.setProperty('--dq-text',t.text);r.setProperty('--dq-muted',t.muted);
r.setProperty('--dq-font-size',t.fontSize+'px');r.setProperty('--dq-line-height',t.lineHeight);
r.setProperty('--dq-font-family',t.fontFamily==='system'?'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif':t.fontFamily==='Georgia'?'Georgia,serif':'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif');
r.setProperty('--dq-radius',t.radius==='soft'?'22px':t.radius==='sharp'?'9px':'16px');
document.documentElement.dataset.dqDensity=t.density;document.documentElement.dataset.dqRadius=t.radius;
try{localStorage.setItem(KEY,JSON.stringify(t));}catch(e){}
document.dispatchEvent(new CustomEvent('daraquiz:themechange',{detail:t}));return t;}
function local(){try{return normalize(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){return normalize({});}}
async function load(){var t=local(),u=window._aqsFirebaseUser;if(u&&!u.isAnonymous&&window._aqsFS&&window._aqsFS.get){try{var p=await window._aqsFS.get('users',u.uid);if(p&&p.preferences&&p.preferences.theme)t=normalize(p.preferences.theme);}catch(e){console.warn('[DaraQuiz theme] Cloud preferences unavailable',e);}}return apply(t);}
async function save(raw){var t=apply(raw),u=window._aqsFirebaseUser;if(u&&!u.isAnonymous&&window._aqsFS&&window._aqsFS.set){var ok=await window._aqsFS.set('users',u.uid,{preferences:{theme:t}},{merge:true});if(!ok)throw new Error('Could not sync theme settings. Your changes remain saved on this device.');}return t;}
window.DaraQuizTheme={defaults:normalize(DEFAULTS),get:local,apply:apply,load:load,save:save,reset:function(){return apply(DEFAULTS);}};
apply(local());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
document.addEventListener('aqs:authchange',function(){load();});
})();