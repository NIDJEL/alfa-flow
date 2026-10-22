#!/usr/bin/env sh
set -eu
# Python 3 stdlib only; no package dependencies.
python3 - "${1:-http://localhost:8088}" <<'PY'
import json,sys,urllib.request,http.cookiejar,uuid
base=sys.argv[1]+"/api/v1"
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf=""
def req(path,body=None,method=None):
    global csrf
    r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),method=method or ("GET" if body is None else "POST"),headers={"Content-Type":"application/json","X-CSRF-Token":csrf,"Idempotency-Key":str(uuid.uuid4())})
    with opener.open(r,timeout=20) as response: result=json.load(response)
    if "csrf_token" in result: csrf=result["csrf_token"]
    return result
assert req("/health/ready")["status"]=="ready"
req("/demo/session",{"persona":"A_APPROVED"})
c=req("/companies/me")
a=req("/applications",dict(product_id="WORKING_CAPITAL_LOAN",purpose="working_capital",amount_kopeks=100000000,term_months=24,declared_revenue_kopeks=c["declared_revenue_kopeks"]))
path="/applications/"+a["id"]
a=req(path+"/submit",dict(version=a["version"],consent=True));assert a["status"]=="offer_issued"
a=req(path+"/offers/"+a["active_offer_id"]+"/accept",dict(version=a["version"],consent=True))
a=req(path+"/sign-simulated",dict(version=a["version"],consent=True))
assert req(path)["status"]=="issued"
print("PASS: A → issued; application="+a["id"])
PY
