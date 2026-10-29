from pathlib import Path
root=Path('.')
files=['js/aqs-study.js','js/aqs-groq-key.js','js/aqs-firebase.js','cloudflare-worker/src/index.js','cloudflare-worker/wrangler.toml']
pats=['studyhubGroqFetch','studyhub_groq_keys','groqFetch','actionGetSettings','setGroqKeys','setFeatureGroqKeys','export default','new URL','pathname','handleImage','fetch(request)','fetch(req)','ai-teacher','quotes.html','aqs-quotes.js']
for fn in files:
    lines=(root/fn).read_text(errors='ignore').splitlines()
    print('\n---',fn, 'lines',len(lines))
    for i,line in enumerate(lines,1):
        if any(x in line for x in pats): print(f'{i}: {line[:220]}')
print('\n--- relevant root files')
for p in root.iterdir():
    if p.is_file() and any(k in p.name.lower() for k in ['quote','teacher','study']): print(p.name)
