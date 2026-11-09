# Runs inside the kill-on-close job, before any browser or service starts.
param([string]$Q,[string]$Out,[string]$Seal,[switch]$Fixture)
$ErrorActionPreference='Stop'
function J($p){Get-Content -LiteralPath $p -Raw | ConvertFrom-Json}
function AtlasHash($p){
 $f=[IO.File]::OpenRead($p);$h=[Security.Cryptography.SHA256]::Create()
 try{[BitConverter]::ToString($h.ComputeHash($f)).Replace('-','').ToLowerInvariant()}
 finally{$h.Dispose();$f.Dispose()}
}
function LocalJson($uri,$token,$body=$null){
 $request=[Net.HttpWebRequest]::Create($uri);$request.Proxy=$null;$request.Timeout=4000;$request.ReadWriteTimeout=4000
 $request.Headers['X-RichAudio-Token']=$token
 if($body -ne $null){
  $bytes=[Text.Encoding]::UTF8.GetBytes($body);$request.Method='POST';$request.ContentType='application/json';$request.ContentLength=$bytes.Length
  $stream=$request.GetRequestStream();try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
 }
 $response=$request.GetResponse()
 try{$reader=[IO.StreamReader]::new($response.GetResponseStream());try{$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}
 finally{$response.Dispose()}
}
function Save($p,$v){$f=[IO.File]::Open($p,'CreateNew');try{$b=[Text.Encoding]::UTF8.GetBytes(($v|ConvertTo-Json -Depth 12));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}}
function Arg($x){if($x -match '["\r\n]'){throw 'Invalid launch argument'};'"'+$x+'"'}
$s=J (Join-Path $Q 'review-seal.json')
if((AtlasHash (Join-Path $Q 'review-seal.json')) -cne $Seal){throw 'Review seal differs'}
$i=J (Join-Path $Out 'execution-intent.json')
$package=Join-Path $Q 'package'
$root=if($Fixture){Join-Path $Out 'service-root'}else{$package}
$node=Join-Path $package 'runtime/node.exe'
$config=if($Fixture){J (Join-Path $Out 'fixture-viewer.json')}else{$s}
$scope=$config.sourceScope
$profile=Join-Path $Out 'browser-profile'
$proof=Join-Path $Out 'current-source-identity.json'
$args01=@((Join-Path $package 'tools/soundmap/server.mjs'),'--root',$root,'--port',[string]$config.port,'--owner',$i.ownerId,'--view-only-map','--operator-map','--installed-context',$config.context,
 '--map-proof-receipt',$proof,'--map-proof-sha256',(AtlasHash $proof),'--map-source-scope',$scope,'--map-source-sha256',(AtlasHash $scope),'--world-atlas',$config.atlas,'--world-atlas-sha256',$config.atlasSHA256)
$service=$null;$browser=$null;$d=$null
try{
 if($Fixture -and (J (Join-Path $Out 'fixture-only.json')).failBeforeViewer){throw 'Disposable worker startup fault before viewer dispatch'}
 $serviceArgs=@{FilePath=$node;ArgumentList=(($args01|ForEach-Object{Arg $_}) -join ' ');WorkingDirectory=$root;WindowStyle='Hidden';PassThru=$true;
  RedirectStandardOutput=(Join-Path $Out 'service.stdout.log');RedirectStandardError=(Join-Path $Out 'service.stderr.log')}
 $service=Start-Process @serviceArgs
 # Windows PowerShell returns a PID-backed Process. Retain its process handle
 # while it is alive so WaitForExit also has the actual exit code.
 $null=$service.Handle
 $desc=Join-Path $root '.local/soundmap/service.json'
 $ready=[Diagnostics.Stopwatch]::StartNew()
 do{
  if($service.HasExited -or $ready.Elapsed.TotalSeconds -gt 45){throw 'Owned atlas service failed startup'}
  if(Test-Path -LiteralPath $desc){$d=J $desc}
  if(!$d -or $d.ownerId -cne $i.ownerId){Start-Sleep -Milliseconds 100}
 }while(!$d -or $d.ownerId -cne $i.ownerId)
 if($d.url -cne ('http://127.0.0.1:'+$config.port) -or $d.token -cnotmatch '^[a-f0-9]{64}$'){throw 'Service capability differs'}
 $status=LocalJson ($d.url+'/api/status') $d.token
 if(!$status.viewOnlyMap -or $status.operatorMap.policy -cne 'operator-controlled' -or !$status.worldAtlas.proof.live -or
  $status.worldAtlas.sha256 -cne $config.atlasSHA256 -or $status.audio.hostConnected -or $status.accepted -ne 0 -or $status.passive.accepted -ne 0){throw 'Exact no-camera atlas service readiness differs'}
 Save (Join-Path $Out 'service-process.json') @{id=$service.Id;path=$node;creationFileTime=$service.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();ownerId=$i.ownerId}
 $browserArgs=@(('--app='+$d.url),('--user-data-dir='+$profile),'--no-first-run','--no-default-browser-check','--window-size=1440,1000')
 if($Fixture){$browserArgs+=@('--headless=new','--remote-debugging-port=0','--disable-background-networking')}
 if((AtlasHash $s.browser) -cne $s.browserSHA256){throw 'Reviewed browser identity differs'}
 $browser=Start-Process -FilePath $s.browser -ArgumentList (($browserArgs|ForEach-Object{Arg $_}) -join ' ') -WorkingDirectory $root -WindowStyle $(if($Fixture){'Hidden'}else{'Normal'}) -PassThru
 $null=$browser.Handle
 Save (Join-Path $Out 'viewer-process.json') @{id=$browser.Id;path=$s.browser;creation=$browser.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();profile=$profile;fixtureOnly=[bool]$Fixture}
 while(!$service.HasExited -and !(Test-Path -LiteralPath (Join-Path $Out 'viewer-shutdown.request'))){
  $controller=Get-Process -Id $i.controllerPid -ErrorAction SilentlyContinue
  if(!$controller -or $controller.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -cne $i.controllerCreation){break}
  if($browser.HasExited -and !(Test-Path -LiteralPath (Join-Path $Out 'viewer-exited.json'))){
   Save (Join-Path $Out 'viewer-exited.json') @{utc=[DateTime]::UtcNow;code=$browser.ExitCode}
  }
  Start-Sleep -Milliseconds 250
 }
 if($service.HasExited){throw 'Owned atlas service exited without shutdown request'}
 if($browser -and !$browser.HasExited){
  if($Fixture){$browser.Kill()}else{$null=$browser.CloseMainWindow()}
  $null=$browser.WaitForExit(2500)
 }
 $body=@{ownerId=$i.ownerId}|ConvertTo-Json -Compress
 $ack=LocalJson ($d.url+'/api/service/stop') $d.token $body
 $nodeExited=$service.WaitForExit(10000)
 if(!$ack.stopping -or !$nodeExited -or $service.ExitCode -ne 0){throw "Owned service did not close cleanly (ack=$($ack.stopping), exited=$nodeExited, exit=$($service.ExitCode))"}
 $terminal=Get-Content -LiteralPath (Join-Path $Out 'service.stdout.log') | Select-Object -Last 1 | ConvertFrom-Json
 if($terminal.kind -cne 'soundmap-view-only-terminal' -or !$terminal.contextClosure.workerJoined -or $terminal.rendererFrames -ne 0){throw 'Owned service terminal did not qualify'}
 Save (Join-Path $Out 'service-terminal.json') $terminal
}finally{
 if($browser -and !$browser.HasExited){$null=$browser.CloseMainWindow();$null=$browser.WaitForExit(2500)}
 if($browser){$browser.Dispose()}
 if($service){$service.Dispose()}
}
