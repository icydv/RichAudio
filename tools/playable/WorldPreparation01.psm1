# Pure configuration assembly and bounded prerequisite checks. No game/archive
# decoder, vendor assembly load, installation transaction or playback occurs.
Set-StrictMode -Version 2
function Get-StreetPreparationField01($Value,[string]$Name,$Default=$null){
 if($null-eq$Value){return $Default};if($Value-is[Collections.IDictionary]){if($Value.Contains($Name)){return $Value[$Name]};return $Default}
 $p=$Value.PSObject.Properties[$Name];if($null-ne$p){return $p.Value};return $Default
}
function Get-StreetPreparationHash01([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Get-StreetPreparationPath01([string]$Root,[string]$Relative){
 if([string]::IsNullOrWhiteSpace($Relative)-or[IO.Path]::IsPathRooted($Relative)){throw 'Relative world preparation payload required'}
 $full=[IO.Path]::GetFullPath((Join-Path $Root $Relative));$prefix=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
 if(!$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'World preparation path escaped its root'}
 for($at=$full;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked world preparation input refused'}}
 return $full
}
function Assert-StreetWorldManifest01($Manifest){
 $world=Get-StreetPreparationField01 $Manifest 'worldPreparation'
 if((Get-StreetPreparationField01 $Manifest 'featureProfile')-cne'STREET-01'-or(Get-StreetPreparationField01 $Manifest 'latencyProfile')-cne'street-01'-or(Get-StreetPreparationField01 $Manifest 'continuityPolicy')-cne'camera-source-01'-or(Get-StreetPreparationField01 $world 'schema')-ne1){throw 'Exact STREET-01 preparation manifest required'}
 $models=@(Get-StreetPreparationField01 $Manifest 'eligible');$contexts=@{}
 foreach($model in $models){$context=Get-StreetPreparationField01 $model 'context';if((Get-StreetPreparationField01 $model 'model')-ne4180675781-or$context-notin@('player','npc')-or$contexts.ContainsKey($context)){throw 'Bati-only STREET-01 source scope required'};$contexts[$context]=$true}
 if($models.Count-lt1-or$models.Count-gt2-or!$contexts.ContainsKey('player')){throw 'Exact Bati player mapping required'}
 if((Get-StreetPreparationField01 $world 'cacheRoot')-cne'.local/plugin-world-warmup'){throw 'Standard private installed-world cache required'}
 $acoustic=Get-StreetPreparationField01 $Manifest 'acousticWorld'
 if((Get-StreetPreparationField01 $acoustic 'cacheRoot')-cne'.local/plugin-world-warmup'-or$null-ne(Get-StreetPreparationField01 $acoustic 'privateCacheRoot')){throw 'Main worker and startup cache must share the installation root'}
 $files=@(Get-StreetPreparationField01 $world 'sourceFiles');if($files.Count-lt10-or$files.Count-gt256-or$files-notcontains'tools/Prepare-InstalledAudioWorld.ps1'-or$files-notcontains'runtime/node.exe'){throw 'Bounded world preparation source closure required'}
 $seen=@{};foreach($file in $files){if($file-isnot[string]-or$seen.ContainsKey($file)){throw 'Unique preparation source paths required'};$seen[$file]=$true}
 foreach($name in @('maximumSeconds','maximumStageSeconds','maximumMemoryMiB','maximumGeometryResources','maximumBatches','maximumTotalSeconds')){$budget=Get-StreetPreparationField01 $world $name;if($budget-isnot[int]-and$budget-isnot[long]){throw 'Integer world preparation budget required'}}
 if($world.maximumSeconds-lt20-or$world.maximumSeconds-gt1800-or$world.maximumStageSeconds-lt5-or$world.maximumStageSeconds-gt1800-or$world.maximumMemoryMiB-lt256-or$world.maximumMemoryMiB-gt4096-or$world.maximumGeometryResources-lt1-or$world.maximumGeometryResources-gt262144-or$world.maximumBatches-lt1-or$world.maximumBatches-gt4-or$world.maximumTotalSeconds-lt$world.maximumSeconds-or$world.maximumTotalSeconds-gt7200){throw 'Supported world preparation budgets required'}
 return $world
}
function Get-StreetCodeWalkerDependency01($WorldPreparation,[string]$CodeWalkerRoot){
 if(!$CodeWalkerRoot-or![IO.Path]::IsPathRooted($CodeWalkerRoot)){throw 'Separately obtained unmodified Core dependency folder required'}
 $root=[IO.Path]::GetFullPath($CodeWalkerRoot);$expected=@('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll');$dependencies=@(Get-StreetPreparationField01 $WorldPreparation 'dependencies');$seen=@{};$bindings=@()
 if($dependencies.Count-ne3){throw 'Exactly the three necessary software dependency bindings are required'}
 foreach($dependency in $dependencies){$file=[string](Get-StreetPreparationField01 $dependency 'file');$sha=[string](Get-StreetPreparationField01 $dependency 'sha256');$bytes=Get-StreetPreparationField01 $dependency 'bytes'
  if($file-notin$expected-or$seen.ContainsKey($file)-or$sha-cnotmatch'^[a-f0-9]{64}$'-or$bytes-isnot[int]-and$bytes-isnot[long]-or$bytes-lt1-or$bytes-gt134217728){throw 'Supported pinned software dependency required'};$seen[$file]=$true
  $full=Get-StreetPreparationPath01 $root $file;$info=Get-Item -LiteralPath $full -Force;if($info.PSIsContainer-or$info.Length-ne$bytes-or(Get-StreetPreparationHash01 $full)-cne$sha){throw ('Separately obtained dependency differs: '+$file)}
  $bindings+=@{RelativePath=$file;SHA256=$sha}
 }
 return [pscustomobject]@{Root=$root;Bindings=$bindings;CoreSHA256=(@($dependencies|Where-Object file -EQ 'CodeWalker.Core.dll')[0].sha256)}
}
function Get-StreetPowerShellDependency01([string]$PowerShellPath){
 if(!$PowerShellPath-or![IO.Path]::IsPathRooted($PowerShellPath)-or[IO.Path]::GetFileName($PowerShellPath)-ine'pwsh.exe'){throw 'Installed PowerShell 7 host required'}
 $power=[IO.Path]::GetFullPath($PowerShellPath);for($at=$power;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked PowerShell host refused'}}
 if([Diagnostics.FileVersionInfo]::GetVersionInfo($power).FileMajorPart-lt7){throw 'Installed PowerShell 7 host required'}
 return [pscustomobject]@{Path=$power;SHA256=(Get-StreetPreparationHash01 $power)}
}
function New-StreetWorldWarmupConfiguration01($Manifest,[string]$InstallRoot,[string]$GameRoot,[string]$CodeWalkerRoot,[string]$PowerShellPath){
 $world=Assert-StreetWorldManifest01 $Manifest;$install=[IO.Path]::GetFullPath($InstallRoot);$game=[IO.Path]::GetFullPath($GameRoot);$dependency=Get-StreetCodeWalkerDependency01 $world $CodeWalkerRoot;$power=Get-StreetPowerShellDependency01 $PowerShellPath
 $sources=@();foreach($relative in $world.sourceFiles){$binding=@($Manifest.bindings|Where-Object file -CEQ $relative);if($binding.Count-ne1-or$binding[0].sha256-cnotmatch'^[a-f0-9]{64}$'){throw 'Exact package source binding missing'}
  $file=Get-StreetPreparationPath01 $install $relative;if((Get-StreetPreparationHash01 $file)-cne$binding[0].sha256){throw ('Installed preparation payload differs: '+$relative)};$sources+=@{RelativePath=$relative;SHA256=$binding[0].sha256}
 }
 $node=Get-StreetPreparationPath01 $install 'runtime/node.exe';$output=Get-StreetPreparationPath01 $install $world.cacheRoot
 return [ordered]@{Schema=1;Enabled=$true;WorkspaceRoot=$install;GameRoot=$game;GameExecutableSHA256=$Manifest.gameSha256;CodeWalkerRoot=$dependency.Root;CodeWalkerCoreSHA256=$dependency.CoreSHA256;CodeWalkerDependencies=$dependency.Bindings;PowerShellPath=$power.Path;PowerShellSHA256=$power.SHA256;NodeExecutable=$node;NodeSHA256=(Get-StreetPreparationHash01 $node);OutputRoot=$output;Sources=$sources;MaximumSeconds=$world.maximumSeconds;MaximumStageSeconds=$world.maximumStageSeconds;MaximumMemoryMiB=$world.maximumMemoryMiB;MaximumGeometryResources=$world.maximumGeometryResources;MaximumBatches=$world.maximumBatches;MaximumTotalSeconds=$world.maximumTotalSeconds;ImportQualifiedGeometry=$true}
}
Export-ModuleMember -Function Assert-StreetWorldManifest01,Get-StreetCodeWalkerDependency01,Get-StreetPowerShellDependency01,New-StreetWorldWarmupConfiguration01
