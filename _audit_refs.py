from pathlib import Path
p=Path('.')
for f in ['studyhub.html','ai-teacher.html','index.html','library.html','ai-animate.html','docs-gen.html']:
 q=p/f
 print('\n---',f)
 if q.exists():
  for i,l in enumerate(q.read_text(errors='ignore').splitlines(),1):
   if any(s in l.lower() for s in ['script src','aqs-quotes','aqs-study','aqs-groq-key','aqs-firebase','quotes','ai-teacher']): print(i,l[:240])
print('\n--- github actions')
for f in (p/'.github/workflows').glob('*'):
 print(f)
 print(f.read_text(errors='ignore')[:2500])
