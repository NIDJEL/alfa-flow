import {readFile} from 'node:fs/promises'
const collection=JSON.parse(await readFile('../api/collection.json','utf8'))
const variables=Object.fromEntries(collection.variable.map(v=>[v.key,v.value]))
variables.baseUrl=process.env.BASE_URL||variables.baseUrl
let cookie='',last
function render(s){return s.replace(/\{\{([^}]+)}}/g,(_,key)=>key==='$guid'?crypto.randomUUID():String(variables[key]??''))}
for(const item of collection.item[0].item){
 const req=item.request
 const response=await fetch(render(req.url),{method:req.method,headers:{...Object.fromEntries(req.header.map(h=>[h.key,render(h.value)])),Cookie:cookie},...(req.body?{body:render(req.body.raw)}:{})})
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0]
 const d=await response.json()
 if(!response.ok)throw new Error(item.name+': '+JSON.stringify(d))
 if(d.csrf_token)variables.csrf_token=d.csrf_token
 if(d.id&&d.status){variables.application_id=d.id;variables.version=d.version}
 if(d.active_offer_id)variables.offer_id=d.active_offer_id
 last=d
 console.log(response.status,item.name)
}
if(last.status!=='issued')throw new Error('Collection did not reach issued')
console.log('PASS: exported Postman A chain reaches issued')
