param([string]$BaseUrl="http://localhost:8088")
$ErrorActionPreference="Stop"
$health=Invoke-RestMethod "$BaseUrl/api/v1/health/ready"
if($health.status -ne "ready"){throw "API не готов"}
$login=Invoke-RestMethod "$BaseUrl/api/v1/demo/session" -Method Post -ContentType "application/json" -Body '{"persona":"A_APPROVED"}' -SessionVariable session
$headers=@{"X-CSRF-Token"=$login.csrf_token}
$company=Invoke-RestMethod "$BaseUrl/api/v1/companies/me" -WebSession $session
$body=@{product_id="WORKING_CAPITAL_LOAN";purpose="working_capital";amount_kopeks=100000000;term_months=24;declared_revenue_kopeks=$company.declared_revenue_kopeks}|ConvertTo-Json
$app=Invoke-RestMethod "$BaseUrl/api/v1/applications" -Method Post -ContentType "application/json" -WebSession $session -Headers $headers -Body $body
function Action($path,$body){
  $headers["Idempotency-Key"]=[Guid]::NewGuid().ToString()
  Invoke-RestMethod "$BaseUrl/api/v1/applications/$($app.id)/$path" -Method Post -ContentType "application/json" -WebSession $session -Headers $headers -Body ($body|ConvertTo-Json)
}
$app=Action "submit" @{version=$app.version;consent=$true}
if($app.status -ne "offer_issued"){throw "Ожидалось offer_issued, получено $($app.status)"}
$app=Action "offers/$($app.active_offer_id)/accept" @{version=$app.version;consent=$true}
$app=Action "sign-simulated" @{version=$app.version;consent=$true}
$persisted=Invoke-RestMethod "$BaseUrl/api/v1/applications/$($app.id)" -WebSession $session
if($persisted.status -ne "issued" -or !$persisted.disbursement_id){throw "Симуляция выдачи не сохранена"}
Write-Host "PASS: A → issued; application=$($app.id); disbursement=$($app.disbursement_id)"
