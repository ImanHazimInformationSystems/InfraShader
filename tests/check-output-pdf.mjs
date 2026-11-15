import {execFileSync} from 'node:child_process'
import path from 'node:path'
export function checkOutputPdf(file, imageRequired = false) {
  const python=path.resolve('apps/api/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  return execFileSync(python,['-c', `from pypdf import PdfReader
import sys
reader=PdfReader(sys.argv[1])
texts=[page.extract_text() for page in reader.pages]
for i,text in enumerate(texts,1):
    assert f'{i} / {len(texts)}' in text, f'Missing page footer {i}'
assert all(word not in ''.join(texts) for word in ['Internal cost','Internal profit','cost_base','DRAFT PREVIEW'])
if sys.argv[2]=='true':
    assert sum(len(page.images) for page in reader.pages)>0, 'Approved image missing'
print(len(texts), 'pages verified')`,file,String(imageRequired)],{encoding:'utf8'})
}

export function pdfText(file) {
  const python=path.resolve('apps/api/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  return execFileSync(python,['-c', `from pypdf import PdfReader
import sys
sys.stdout.reconfigure(encoding='utf-8')
print(chr(10).join(page.extract_text() for page in PdfReader(sys.argv[1]).pages))`,file],{encoding:'utf8'})
}
