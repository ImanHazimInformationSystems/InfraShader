// Optional documentation renderer; no production dependencies are added.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(process.env.USERPROFILE || process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node');
const entry=process.env.INFRASHADER_ARTIFACT_MODULE || createRequire(path.join(runtime,'package.json')).resolve('@oai/artifact-tool');
const {FileBlob,SpreadsheetFile}=await import(entry.startsWith('file:')?entry:pathToFileURL(entry).href);
const base=path.join(root,'docs/tracking');
const data=JSON.parse(await fs.readFile(path.join(base,'workbook-data.json'),'utf8'));
const reviewLabel=new Date(data.review_date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'});
const out=path.join(root,`outputs/feature-audit-${data.review_date}`);
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(base,'sources/original-checklist.xlsx')));
const overview=wb.worksheets.getItem('Overview');
const historic=wb.worksheets.add('Original Overview');
historic.getRange('A1:I45').copyFrom(overview.getRange('A1:I45'),'all');
historic.getRange('B3').values=[['HISTORICAL SOURCE SNAPSHOT â€¢ 18 October. Original reported statuses; not current audited tracking.']];
for(const name of ['Design Studio','Organisation Review','Shared Platform','AI and Analysis','Focused Refinements','Baseline Reference','Requirement Index','Resources']){
  wb.worksheets.getItem(name).getRange('B3').values=[['HISTORICAL SOURCE SNAPSHOT â€¢ Read current Feature Register / Acceptance Checklist. Edit canonical CSVs, not this tab.']];
}
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const validation={
 'Repository-audited implementation status':['Not audited','Not implemented','Partial','Implemented'],
 'Verification status':['Not run','Passed','Failed','Blocked','Not applicable'],
 'Result':['Not run','Passed','Failed','Blocked','Not applicable'],
 'Deployment status':['Unknown','Local only','Deployed'],
 'Acceptance status':['Not assessed','Pending','Accepted','Rejected'],
};
let index=0;
for(const [name,rows] of Object.entries(data.tables)){
  const sheet=wb.worksheets.add(name);sheet.showGridLines=false;sheet.tabColor='#176B67';
  const headers=Object.keys(rows[0]);const last=col(headers.length-1);const end=rows.length+5;
  sheet.getRange('A1:F1').merge();sheet.getRange('A1').values=[[name+' - '+reviewLabel]];
  sheet.getRange('A1:F1').format={fill:'#123C3A',font:{bold:true,color:'#FFFFFF',size:17},rowHeight:34};
  sheet.getRange('A2:F2').merge();sheet.getRange('A2').values=[['Generated from canonical docs/tracking CSVs. Reported status, audited implementation, verification, deployment and acceptance are separate.']];
  sheet.getRange('A2:F2').format={wrapText:true,rowHeight:30,font:{color:'#526566',size:10}};
  const matrix=[headers,...rows.map(r=>headers.map(h=>r[h]??''))];
  sheet.getRange(`A5:${last}${end}`).values=matrix;
  const table=sheet.tables.add(`A5:${last}${end}`,true,'TrackingTable'+(++index));table.showFilterButton=true;
  sheet.getRange(`A5:${last}${end}`).format={font:{name:'Calibri',size:11},wrapText:true,verticalAlignment:'top',rowHeight:75,columnWidth:25};
  sheet.getRange(`A5:${last}5`).format={fill:'#176B67',font:{bold:true,color:'#FFFFFF'},rowHeight:47};
  sheet.getRange(`A6:A${end}`).format={font:{bold:true,color:'#155F5B'},columnWidth:18};
  headers.forEach((h,i)=>{
    const c=col(i),range=sheet.getRange(`${c}6:${c}${end}`);
    if(/summary|behaviour|Remaining|Requirement$|Finding|Resolution|Prerequisites|Context|Verification method/.test(h))range.format.columnWidth=64;
    if(/Feature name|Source section|Relevant|Evidence|Specification/.test(h))range.format.columnWidth=42;
    if(validation[h])range.dataValidation={rule:{type:'list',values:validation[h]}};
    if(h==='Last reviewed date'){
      range.values=rows.map(r=>[new Date(r[h]+'T00:00:00Z')]);range.setNumberFormat('yyyy-mm-dd');
    }
  });
  sheet.getRange(`A6:${last}${end}`).format.autofitRows();
  sheet.freezePanes.freezeRows(5);sheet.freezePanes.freezeColumns(1);
}
overview.getRange('A1:Q60').unmerge();overview.getRange('A1:Q60').clear({applyTo:'all'});overview.showGridLines=false;
overview.getRange('B2:I2').merge();overview.getRange('B2').values=[['InfraShader feature audit & scope tracker']];
overview.getRange('B2:I2').format={fill:'#123C3A',font:{size:20,bold:true,color:'#FFFFFF'},rowHeight:42};
overview.getRange('B3:I3').merge();overview.getRange('B3').values=[[reviewLabel+' - Current tracking. Implementation, verification and acceptance are separate.']];
overview.getRange('B3:I3').format={wrapText:true,rowHeight:36,font:{size:11,color:'#526566'}};
overview.getRange('B5:D5').values=[['Roadmap implementation','Records','Denominator: S/L/O/A only']];
overview.getRange('F5:H5').values=[['Roadmap verification','Records','Full feature acceptance set']];
const n=data.tables['Feature Register'].length+5;
const criteria=(column,state)=>`=COUNTIFS('Feature Register'!$D$6:$D$${n},"Yes",'Feature Register'!$${column}$6:$${column}$${n},"${state}")`;
for(const [i,s] of ['Not audited','Not implemented','Partial','Implemented'].entries()){
  overview.getRange(`B${6+i}`).values=[[s]];overview.getRange(`C${6+i}`).formulas=[[criteria('J',s)]];
}
for(const [i,s] of ['Not run','Passed','Failed','Blocked','Not applicable'].entries()){
  overview.getRange(`F${6+i}`).values=[[s]];overview.getRange(`G${6+i}`).formulas=[[criteria('K',s)]];
}
overview.getRange('B11').values=[['Roadmap total']];overview.getRange('C11').formulas=[['=SUM(C6:C9)']];
overview.getRange('B13:C16').values=[['Tracking records',129],['Baseline references',38],['Refinements',6],['Original SRS names',160]];
overview.getRange('F13:G16').values=[['Deployment: Unknown',85],['Acceptance: Not assessed',85],['New derived criteria',data.tables['Acceptance Checklist'].filter(r=>!r['Original requirement ID']).length],['All acceptance records',data.tables['Acceptance Checklist'].length]];
overview.getRange('C13').formulas=[[`=COUNTA('Feature Register'!$A$6:$A$${n})`]];
overview.getRange('C14').formulas=[[`=COUNTIF('Feature Register'!$C$6:$C$${n},"Baseline cross-reference")`]];
overview.getRange('C15').formulas=[[`=COUNTIF('Feature Register'!$C$6:$C$${n},"Refinement")`]];
overview.getRange('G13').formulas=[[criteria('L','Unknown')]];
overview.getRange('G14').formulas=[[criteria('M','Not assessed')]];
const acEnd=data.tables['Acceptance Checklist'].length+5;
overview.getRange('G15').formulas=[['=G16-C16']];
overview.getRange('G16').formulas=[[`=COUNTA('Acceptance Checklist'!$A$6:$A$${acEnd})`]];
const notes=[
 ['Counting','85 project roadmap features: 84 original PDF baseline plus user-requested L31 addendum. F/D/E overlap; K refines parent workflows. Resources, gates and requirement IDs are excluded. No completion percentage.'],
 ['Implementation','Not audited / Not implemented / Partial / Implemented. Partial identifies inspected foundation and missing scope; Not audited does not mean absent.'],
 ['Verification','Not run / Passed / Failed / Blocked / Not applicable. Read feature-specific evidence and gate status; functional tests are distinct from field/customer acceptance.'],
 ['Deployment & acceptance','Deployment: Unknown / Local only / Deployed. Acceptance: Not assessed / Pending / Accepted / Rejected. Each needs independent supporting evidence.'],
 ['Historical audit checks','26 October: 36 frontend tests; 158 backend passed, 26 skipped; 9 desktop Demo/fixture browser tests. Lint, types, build and Ruff passed. Real service, field and pilot checks not rerun.'],
 ['Precedence','Catalogue section 00 refinements and section 10 roadmap control. KEEP/CORE/NEXT/LATER are priorities, not completion. Gated expansions remain gated.'],
 ['Maintain','Edit docs/tracking CSVs; run python scripts/tracking.py, then --check; render with node scripts/tracking-workbook.mjs. Do not edit generated views independently.'],
 ['Historical tabs','Original workspace tabs and Original Overview preserve the reported source snapshot and formulas. Current truth is Feature Register plus linked evidence.'],
 ['Open questions','Full SRS criterion wording; owner rubric/tie/missing-data policy; L05/F17 gate; L11 stage; commercial, field, device and customer validation. See Reconciliation.'],
];
notes.forEach(([label,value],i)=>{let row=19+i*3;overview.getRange(`B${row}:C${row+1}`).merge();overview.getRange(`B${row}`).values=[[label]];overview.getRange(`D${row}:I${row+1}`).merge();overview.getRange(`D${row}`).values=[[value]];});
overview.getRange('B5:I47').format.font.name='Calibri';overview.getRange('B5:I47').format.font.size=11;
overview.getRange('B19:I47').format.wrapText=true;overview.getRange('B19:I47').format.verticalAlignment='center';overview.getRange('B19:I47').format.rowHeight=23;
overview.getRange('B:B').format.columnWidth=22;overview.getRange('C:C').format.columnWidth=14;overview.getRange('D:E').format.columnWidth=20;overview.getRange('F:F').format.columnWidth=28;overview.getRange('G:I').format.columnWidth=17;
overview.getRange('B5:I5').format={fill:'#176B67',font:{bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:36};overview.getRange('B11:C11').format={fill:'#D8ECE7',font:{bold:true}};
overview.freezePanes.freezeRows(5);
wb.recalculate();
if(overview.getRange('C11').values[0][0]!==85)throw new Error('Project roadmap total mismatch');
for(const [i,s] of ['Not audited','Not implemented','Partial','Implemented'].entries())if(overview.getRange(`C${6+i}`).values[0][0] !== (data.counts[s]||0))throw new Error('Status formula mismatch '+s);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:50},maxChars:1500})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'InfraShader_Feature_Implementation_Checklist_Revised.xlsx'));
for(const name of ['Overview',...Object.keys(data.tables)]){
  const png=await wb.render({sheetName:name,range:name==='Overview'?'B2:I17':'A1:F9',scale:1.3,format:'png'});
  await fs.writeFile(path.join(base,'evidence','workbook-'+name.replaceAll(' ','-')+'.png'),new Uint8Array(await png.arrayBuffer()));
}
await fs.writeFile(path.join(base,'evidence/workbook-generation.json'),JSON.stringify({output:path.relative(root,out),rows:Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,v.length])),counts:data.counts,canonical_hashes:data.canonical_hashes,formula_total:overview.getRange('C11').values[0][0]},null,2));
console.log('Workbook exported; formula total and implementation counts validated.');
