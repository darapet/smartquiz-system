from pathlib import Path
root=Path('.')
patterns=['groqFetch','studyhubGroqFetch','fetch(','model:','_AQS_GROQ_MODEL','GROQ_MODEL','llama-3.3-70b-versatile','pixtral','gemini-2.5','gemini-2.0','marked','renderParagraphs','_aqsShowUserError','showErr(','Could not generate','catch (','catch(e','catch(err','action: \'aqs_save_settings\'','aqs_save_settings','aqs_get_settings']
files=['admin-settings.html','js/aqs-firebase.js','js/aqs-groq-key.js','js/aqs-study.js','js/aqs-quotes.js','js/aqs-ai-teacher.js','js/aqs-challenge.js','js/aqs-library.js','js/aqs-animate.js','js/aqs-imagegen.js','js/aqs-studio.js','js/aqs-docsgen.js','js/aqs-quiz.js','functions/index.js','cloudflare-worker/src/worker.js','cloudflare-worker/src/index.js','cloudflare-worker/wrangler.toml','wrangler.toml']
for name in files:
 p=root/name
 print('\n###',name, 'exists=',p.exists())
 if not p.exists(): continue
 lines=p.read_text(errors='ignore').splitlines()
 for i,line in enumerate(lines,1):
  if any(pt.lower() in line.lower() for pt in patterns): print(f'{i}: {line[:260]}')
