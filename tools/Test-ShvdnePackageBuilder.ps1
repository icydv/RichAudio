#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/migration-shvdne-01/package-builder-fixture-'+[Guid]::NewGuid().ToString('N'))}
$fixtureRoot=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/migration-shvdne-01'))+'\'
if(!$fixtureRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $fixtureRoot)){throw 'Fresh migration-private fixture directory required.'}
for($at=$fixtureRoot;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused.'}}
[IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null
$original=Get-Content -LiteralPath $BuildReceipt -Raw|ConvertFrom-Json
$originalRoot=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($BuildReceipt))
$builder=Join-Path $repo 'tools/Package-Shvdne.ps1'
$cases=[Collections.Generic.List[object]]::new()
function Fixture([string]$name){
    $dir=Join-Path $fixtureRoot $name
    [IO.Directory]::CreateDirectory($dir)|Out-Null
    $copy=$original|ConvertTo-Json -Depth 30|ConvertFrom-Json
    foreach($pin in $copy.outputs){
        if($pin.file-notin@('RichAudio.Shvdne.dll','RichAudio.Acoustics.Host.exe','RichAudio.GateAProfile01.Shvdne.dll')){throw 'Unexpected fixture input output name.'}
        Copy-Item -LiteralPath (Join-Path $originalRoot $pin.file) -Destination (Join-Path $dir $pin.file)
    }
    $copy.integration=Join-Path $dir 'RichAudio.Shvdne.dll'
    $copy.host=Join-Path $dir 'RichAudio.Acoustics.Host.exe'
    if($copy.probe){$copy.probe=Join-Path $dir 'RichAudio.GateAProfile01.Shvdne.dll'}
    return [pscustomobject]@{Directory=$dir;Value=$copy;Receipt=(Join-Path $dir 'build-receipt.json')}
}
function Save($fixture){$fixture.Value|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $fixture.Receipt -Encoding utf8}
function Reject([string]$name,[scriptblock]$edit){
    $f=Fixture $name
    & $edit $f
    Save $f
    $destination=Join-Path $fixtureRoot ($name+'-package')
    $failure=$null
    try{& $builder -BuildReceipt $f.Receipt -OutputRoot $destination|Out-Null}catch{$failure=$_.Exception.Message}
    if(!$failure){throw "Negative fixture accepted: $name"}
    if(Test-Path -LiteralPath $destination){throw "Negative fixture wrote package output before refusal: $name"}
    $cases.Add([ordered]@{case=$name;passed=$true;refusal=$failure})
}
Reject 'redirected-integration' {param($f) $f.Value.integration=$f.Value.host}
Reject 'redirected-host' {param($f) $f.Value.host=$f.Value.integration}
Reject 'missing-integration-pin' {param($f) $f.Value.outputs=@($f.Value.outputs|Where-Object file -NE 'RichAudio.Shvdne.dll')}
Reject 'duplicate-host-pin' {param($f) $f.Value.outputs+=@($f.Value.outputs|Where-Object file -EQ 'RichAudio.Acoustics.Host.exe')}
Reject 'output-byte-tamper' {param($f) [IO.File]::AppendAllText($f.Value.integration,'fixture-tamper')}
Reject 'config-source-mismatch' {param($f) foreach($pin in $f.Value.sources){if($pin.path-eq'config/shvdne/integration.json'){$pin.sha256='0'*64}}}
Reject 'config-source-missing' {param($f) $f.Value.sources=@($f.Value.sources|Where-Object path -NE 'config/shvdne/integration.json')}
$good=Fixture 'valid';Save $good
$package=Join-Path $fixtureRoot 'valid-package'
& $builder -BuildReceipt $good.Receipt -OutputRoot $package|Out-Null
$receipt=Get-Content -LiteralPath (Join-Path $package 'package-receipt.json') -Raw|ConvertFrom-Json
$config=Get-Content -LiteralPath (Join-Path $package 'scripts/RichAudio/integration.json') -Raw|ConvertFrom-Json
if($receipt.installed-or$receipt.liveAuthorized-or$receipt.probeIncluded-or$receipt.thirdPartyLoaderBundled-or$config.enabled-or$config.hostEnabled-or$config.allowMemoryTelemetry){throw 'Candidate crossed dormant boundary.'}
$forbidden=@(Get-ChildItem -LiteralPath $package -Recurse -File|Where-Object {$_.Name-match'(?i)(GateAProfile|ScriptHookVDotNet|RagePluginHook|\.asi$|\.Rph\.dll$)'})
if($forbidden.Count){throw 'Normal candidate includes a probe/framework loader.'}
$payload=Join-Path $package 'scripts/RichAudio/payload'
$importPattern='(?:\bfrom\s*|\bimport\s*\()\s*["'']([^"'']+)["'']'
foreach($module in Get-ChildItem -LiteralPath $payload -Recurse -File -Filter '*.mjs'){
    foreach($match in [regex]::Matches((Get-Content -LiteralPath $module.FullName -Raw),$importPattern)){
        $relative=$match.Groups[1].Value
        if($relative.StartsWith('.')){
            $dependency=[IO.Path]::GetFullPath((Join-Path $module.DirectoryName $relative))
            if(!$dependency.StartsWith($payload+'\',[StringComparison]::OrdinalIgnoreCase)-or!(Test-Path -LiteralPath $dependency -PathType Leaf)){throw ('Unclosed static module import: '+$module.Name+' -> '+$relative)}
        }
    }
}
$cases.Add([ordered]@{case='static-module-import-closure';passed=$true})
foreach($pin in $receipt.files){
    $actual=(Get-FileHash -LiteralPath (Join-Path $package $pin.file) -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual-cne$pin.sha256){throw 'Final package receipt hash mismatch.'}
}
$cases.Add([ordered]@{case='valid-disabled-package';passed=$true;files=$receipt.files.Count})
$outside=Join-Path $repo ('.local/package-builder-outside-'+[Guid]::NewGuid().ToString('N'))
$refused=$false
try{& $builder -BuildReceipt $good.Receipt -OutputRoot $outside|Out-Null}catch{$refused=$true}
if(!$refused-or(Test-Path -LiteralPath $outside)){throw 'Builder accepted output outside migration root.'}
$cases.Add([ordered]@{case='outside-migration-output-refused';passed=$true})
# Authored copy-only fixtures: node.exe and old RichAudio.dll contain plain
# marker text, are never executed, and do not represent distributable runtimes.
$retainedRoot=Join-Path $fixtureRoot 'authored-retained'
[IO.Directory]::CreateDirectory($retainedRoot)|Out-Null
$authored=[ordered]@{
    'runtime/node.exe'='AUTHORED NONEXECUTABLE NODE COPY FIXTURE'
    'runtime/NODE-LICENSE.txt'='AUTHORED LICENSE RETENTION FIXTURE ONLY'
    'runtime/RichAudio.Acoustics.Host.exe'='AUTHORED OLD HOST COPY FIXTURE'
    'tools/soundmap/ui/index.html'='<html>AUTHORED OLD HTML</html>'
    'tools/soundmap/ui/style.css'='/* AUTHORED OLD CSS */'
    'config/vehicle-loudness-policy.json'='{"authoredOldPolicy":true}'
    'plugin/RichAudio.dll'='AUTHORED OLD RPH ADAPTER COPY FIXTURE'
    'rph-prerequisite.json'='{"authoredOldRphPrerequisite":true}'
}
$oldPins=@(foreach($entry in $authored.GetEnumerator()){
    $path=Join-Path $retainedRoot $entry.Key
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null
    [IO.File]::WriteAllText($path,$entry.Value,[Text.UTF8Encoding]::new($false))
    [ordered]@{file=$entry.Key;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$oldManifest=Join-Path $retainedRoot 'playable.json'
[ordered]@{schema=1;gameVersion='1.0.1158.16';rphVersion='1.132.1428.17748';bindings=$oldPins;authoredCopyFixture=$true}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $oldManifest -Encoding utf8
$retainedPackage=Join-Path $fixtureRoot 'retained-package'
& $builder -BuildReceipt $good.Receipt -RetainedManifest $oldManifest -OutputRoot $retainedPackage|Out-Null
$retainedPayload=Join-Path $retainedPackage 'scripts/RichAudio/payload'
$retainedReceipt=Get-Content -LiteralPath (Join-Path $retainedPackage 'package-receipt.json') -Raw|ConvertFrom-Json
$converted=Get-Content -LiteralPath (Join-Path $retainedPayload 'playable.json') -Raw|ConvertFrom-Json
if(!$retainedReceipt.privateRetainedAssets-or$converted.integrationFramework-cne'shvdne'-or$converted.PSObject.Properties.Name-contains'rphVersion'){throw 'Retained fixture framework conversion failed.'}
foreach($relative in @('tools/soundmap/ui/index.html','tools/soundmap/ui/style.css','config/vehicle-loudness-policy.json')){
    if((Get-FileHash -LiteralPath (Join-Path $retainedPayload $relative)).Hash-cne(Get-FileHash -LiteralPath (Join-Path $repo $relative)).Hash){throw ('Retained artifact did not refresh current source: '+$relative)}
}
foreach($relative in @('plugin/RichAudio.dll','rph-prerequisite.json')){
    if(Test-Path -LiteralPath (Join-Path $retainedPayload $relative)){throw 'Obsolete RPH artifact survived conversion.'}
}
foreach($relative in @('runtime/node.exe','runtime/NODE-LICENSE.txt')){
    if((Get-FileHash -LiteralPath (Join-Path $retainedPayload $relative)).Hash-cne(Get-FileHash -LiteralPath (Join-Path $retainedRoot $relative)).Hash){throw 'Retained Node/license bytes changed.'}
}
if((Get-FileHash -LiteralPath (Join-Path $retainedPayload 'runtime/RichAudio.Acoustics.Host.exe')).Hash-cne(Get-FileHash -LiteralPath $good.Value.host).Hash){throw 'Retained host was not replaced by the verified new host.'}
$names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($pin in $converted.bindings){
    if(!$names.Add($pin.file)-or(Get-FileHash -LiteralPath (Join-Path $retainedPayload $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Retained converted binding duplicates or differs.'}
}
foreach($pin in $oldPins){if((Get-FileHash -LiteralPath (Join-Path $retainedRoot $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Original authored retained input changed.'}}
$cases.Add([ordered]@{case='retained-ui-refresh-and-rph-omission';passed=$true;authoredCopyFixture=$true;runtimeExecuted=$false;bindings=$converted.bindings.Count})
$cases|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $fixtureRoot 'results.json') -Encoding utf8
Write-Output ('PASS SHVDNE package builder cases='+$cases.Count+'; no installation or game execution. '+$fixtureRoot)
