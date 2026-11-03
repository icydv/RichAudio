# Public portable Node runtime only. No installation, key or game lookup.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$out=[IO.Path]::GetFullPath($OutputRoot)
if(!$out.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private runtime directory required'}
for($at=[IO.Path]::GetDirectoryName($out);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked runtime path refused'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
$url='https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip'
$expected='dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a'
$archive=Join-Path $out 'node-v26.13.0-win-x64.zip'
Invoke-WebRequest -Uri $url -OutFile $archive
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()-cne$expected){throw 'Public runtime archive digest mismatch; nothing executed'}
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
 foreach($name in @('node.exe','LICENSE')){
  $entry=$zip.GetEntry('node-v26.13.0-win-x64/'+$name)
  if(!$entry-or$entry.Length-le0-or$entry.Length-gt134217728){throw 'Exact bounded public runtime member required'}
  $input=$entry.Open();$output=[IO.File]::Open((Join-Path $out $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$input.CopyTo($output)}finally{$input.Dispose();$output.Dispose()}
 }
}finally{$zip.Dispose()}
$runtime=Join-Path $out 'node.exe'
$start=[Diagnostics.ProcessStartInfo]::new($runtime,'--version')
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables.Clear();$start.EnvironmentVariables['SystemRoot']=$env:SystemRoot;$start.EnvironmentVariables['WINDIR']=$env:WINDIR
$probe=[Diagnostics.Process]::new();$probe.StartInfo=$start
try{
 if(!$probe.Start()){throw 'Pinned runtime version probe failed to start'}
 if(!$probe.WaitForExit(5000)){$probe.Kill();if(!$probe.WaitForExit(5000)){throw 'Pinned runtime version process did not join; preparation unqualified'};throw 'Pinned runtime version deadline exceeded'}
 $actual=$probe.StandardOutput.ReadToEnd().Trim();$diagnostic=$probe.StandardError.ReadToEnd()
 if($probe.ExitCode-ne0-or$actual-cne'v26.13.0'-or$diagnostic.Length-ne0){throw 'Pinned runtime version probe failed'}
}finally{$probe.Dispose()}
[ordered]@{schema=1;kind='World041PublicNodeRuntime';version=$actual;sourceUrl=$url;archiveSHA256=$expected;runtimeSHA256=(Get-FileHash -LiteralPath $runtime -Algorithm SHA256).Hash.ToLowerInvariant();runtimeBytes=(Get-Item -LiteralPath $runtime).Length;installed=$false;gameFilesRead=$false;realKeysRead=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'runtime.json') -Encoding utf8NoBOM
Write-Output 'PASS portable public Node26 runtime verified; no global installation'
