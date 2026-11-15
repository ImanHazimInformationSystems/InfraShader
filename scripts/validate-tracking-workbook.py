"""Read-only OOXML reconciliation of generated workbook against canonical data."""
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
def read(path):
    result={}
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            shared=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets',NS):
            target=rels[s.attrib[REL]].lstrip('/')
            if not target.startswith('xl/'):target='xl/'+target
            node=ET.fromstring(z.read(target));cells={}
            for c in node.findall('.//m:sheetData/m:row/m:c',NS):
                v=c.find('m:v',NS);f=c.find('m:f',NS);value=v.text if v is not None else ''
                if c.attrib.get('t')=='s':value=shared[int(value)]
                elif c.attrib.get('t')=='inlineStr':value=''.join(c.find('m:is',NS).itertext())
                cells[c.attrib['r']]={'value':value or '', 'formula':f.text if f is not None else ''}
            result[s.attrib['name']]=(cells,node)
        errors=[(s,a,c['value']) for s,(cells,_) in result.items() for a,c in cells.items() if c['value'] in ['#REF!','#VALUE!','#NAME?','#DIV/0!','#NUM!']]
        assert not errors,errors
        tables=[ET.fromstring(z.read(p)) for p in z.namelist() if re.fullmatch(r'xl/tables/table\d+\.xml',p)]
    return result,tables
def column(n):
    out=''
    while n:
        n,r=divmod(n-1,26);out=chr(65+r)+out
    return out
def main():
    base=ROOT/'docs/tracking';payload=json.loads((base/'workbook-data.json').read_text(encoding='utf-8'))
    path=ROOT/'outputs'/f"feature-audit-{payload['review_date']}"/'InfraShader_Feature_Implementation_Checklist_Revised.xlsx'
    sheets,tables=read(path)
    for name,rows in payload['tables'].items():
        cells,node=sheets[name];headers=list(rows[0])
        for i,h in enumerate(headers,1):assert cells[f'{column(i)}5']['value']==h
        for rownum,row in enumerate(rows,6):
            for i,h in enumerate(headers,1):
                actual=cells.get(f'{column(i)}{rownum}',{}).get('value','')
                if h=='Last reviewed date':continue
                assert actual==str(row[h]),(name,rownum,h,actual,row[h])
        assert node.find('.//m:pane',NS) is not None,(name,'missing frozen headers')
    old,_=read(base/'sources/original-checklist.xlsx');preserved=0
    for name,(cells,_) in old.items():
        new=sheets['Original Overview' if name=='Overview' else name][0]
        for address,cell in cells.items():
            if address=='B3' or (not cell['value'] and not cell['formula']):continue
            current=new.get(address,{'value':'','formula':''})
            if cell['formula']:assert current['formula']==cell['formula'],(name,address,'formula changed')
            else:assert current['value']==cell['value'],(name,address,'source value changed')
            preserved+=1
    overview=sheets['Overview'][0]
    assert float(overview['C11']['value'])==85
    assert float(overview['G15']['value'])==sum(not r['Original requirement ID'] for r in payload['tables']['Acceptance Checklist'])
    for address,value in [('C13',129),('C14',38),('C15',6),('C16',160),('G16',len(payload['tables']['Acceptance Checklist']))]:
        assert float(overview[address]['value'])==value,(address,value)
    for i,status in enumerate(['Not audited','Not implemented','Partial','Implemented'],6):assert float(overview[f'C{i}']['value'])==payload['counts'].get(status,0)
    assert all(t.find('m:autoFilter',NS) is not None for t in tables),'Table without filter'
    report={'workbook':str(path),'sheets':len(sheets),'tables_with_filters':len(tables),'source_cells_or_formulas_preserved':preserved,'canonical_table_values_match':True,'roadmap_total':85,'acceptance_rows':len(payload['tables']['Acceptance Checklist']),'formula_errors':0,'scope':'OOXML integrity + cell/formula/table reconciliation; not a native Excel desktop launch'}
    (base/'evidence/workbook-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
