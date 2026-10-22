import {readFile,writeFile} from 'node:fs/promises'
const spec=JSON.parse(await readFile(new URL('../api/openapi.yaml',import.meta.url),'utf8'))
const items=[]
const examples={
  '/demo/session':{persona:'A_APPROVED'},
  '/applications':{product_id:'WORKING_CAPITAL_LOAN',purpose:'working_capital',amount_kopeks:100000000,term_months:24,declared_revenue_kopeks:300000000},
  '/applications/{id}/submit':{version:'{{version}}',consent:true},
  '/applications/{id}/offers/{offerId}/accept':{version:'{{version}}',consent:true},
  '/applications/{id}/sign-simulated':{version:'{{version}}',consent:true},
  '/applications/{id}/simulations':{product_id:'WORKING_CAPITAL_LOAN',purpose:'working_capital',amount_kopeks:100000000,term_months:24,declared_revenue_kopeks:300000000},
  '/companies/me/cashflow/forecast':{horizon_days:90},
  '/bank/applications/{id}/decision-passport/replay':{},
}
for(const [path,ops] of Object.entries(spec.paths))for(const [method,op] of Object.entries(ops)){
 const raw='{{baseUrl}}/api/v1'+path.replace('{id}','{{application_id}}').replace('{offerId}','{{offer_id}}')
 const request={method:method.toUpperCase(),header:[{key:'Content-Type',value:'application/json'},{key:'X-CSRF-Token',value:'{{csrf_token}}'},{key:'Idempotency-Key',value:'{{$guid}}'}],url:raw,description:op.summary}
 if(op.requestBody){const body=examples[path]||{};let json=JSON.stringify(body,null,2).replace('"{{version}}"','{{version}}');request.body={mode:'raw',raw:json,options:{raw:{language:'json'}}}}
 const script=["let d;try{d=pm.response.json()}catch(e){}","pm.test('Без server error',()=>pm.expect(pm.response.code).to.be.below(500));","if(d?.csrf_token)pm.collectionVariables.set('csrf_token',d.csrf_token);","if(d?.id&&d?.status){pm.collectionVariables.set('application_id',d.id);pm.collectionVariables.set('version',d.version)}","if(d?.active_offer_id)pm.collectionVariables.set('offer_id',d.active_offer_id);"]
 items.push({name:method.toUpperCase()+' '+path+' — '+op.summary,request,event:[{listen:'test',script:{type:'text/javascript',exec:script}}]})
}
const sequence=['POST /demo/session','POST /applications —','POST /applications/{id}/submit','POST /applications/{id}/offers/{offerId}/accept','POST /applications/{id}/sign-simulated']
const flow=sequence.map(prefix=>structuredClone(items.find(x=>x.name.startsWith(prefix))))
const collection={info:{name:'ALFA FLOW — синтетический кредитный конвейер',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',description:'Сначала папка A E2E. Cookie jar включён. Все данные синтетические. Полный API: для банка сменить persona на BANK, для reset ADMIN. Не отправляйте пустые примеры request-info/decide без нужного состояния и полей из OpenAPI.'},variable:[{key:'baseUrl',value:'http://localhost:8088'},{key:'csrf_token',value:''},{key:'application_id',value:''},{key:'offer_id',value:''},{key:'version',value:'1'}],item:[{name:'A — E2E login → submit → accept → sign → issued',item:flow},{name:'Все реальные API routes (сверять предусловия в Swagger)',item:items}]}
await writeFile(new URL('../api/collection.json',import.meta.url),JSON.stringify(collection,null,2)+'\n')
console.log('Postman 2.1 collection generated: '+items.length+' operations + A chain')
