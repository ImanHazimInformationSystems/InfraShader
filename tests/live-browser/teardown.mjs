import {readFile} from 'node:fs/promises'
export default async function teardown(){
 const fixture=JSON.parse(await readFile('.local/live-browser-fixture.json','utf8'))
 const response=await fetch('http://127.0.0.1:8000/fixture/cleanup',{method:'POST',headers:{'X-Fixture-Key':fixture.cleanup_key}})
 if(!response.ok)throw new Error('Local Auth/Storage fixture cleanup failed; inspect the disposable test resources.')
}
