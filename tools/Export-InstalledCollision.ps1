# Run with Windows PowerShell 5.1: the existing CodeWalker dev46 requires .NET Framework.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$GameRoot,
    [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
    [Parameter(Mandatory=$true)][string]$Archive,
    [string]$EntryPath='',
    [string]$EntryListPath='',
    [string]$OutputRoot='',
    [int]$MaxResourceBytes=134217728,
    [string]$ExportScriptPath='',
    [switch]$LoadKeys,
    [switch]$HashArchive
)
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSEdition -eq 'Core') { throw 'Run this extractor with Windows PowerShell 5.1; conversion uses Node separately.' }
$scriptFile=if($ExportScriptPath){[IO.Path]::GetFullPath($ExportScriptPath)}else{$PSCommandPath}
if(!$scriptFile){throw 'Supply ExportScriptPath when loading this tool as a ScriptBlock.'}
$repo=[IO.Path]::GetFullPath((Join-Path (Split-Path $scriptFile -Parent) '..')).TrimEnd('\')
if (!$OutputRoot) {$OutputRoot=Join-Path $repo ('.local\collision-export-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))}
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$output=[IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
# Enforce private ignored storage as well as a read-only boundary around the game and parser.
$private=Join-Path $repo '.local'
if (!$output.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Collision output must be under this checkout .local directory.'}
foreach ($inputRoot in @($game,$cw)) {if ($output.Equals($inputRoot,[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Output must be outside game/parser input roots.'}}
for($part=New-Object IO.DirectoryInfo($output);$null -ne $part;$part=$part.Parent){if($part.Exists -and ($part.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked collision output ancestors are unsupported.'}}
if ([IO.Path]::IsPathRooted($Archive) -or $Archive -match '(^|[\\/])\.\.([\\/]|$)' -or $Archive -notmatch '\.rpf$') {throw 'Provide a game-relative RPF path without traversal.'}
$archivePath=[IO.Path]::GetFullPath((Join-Path $game $Archive))
if (!$archivePath.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Archive escaped game root.'}
if ($MaxResourceBytes -lt 1 -or $MaxResourceBytes -gt 134217728) {throw 'Resource limit must be 1..134217728 bytes.'}
if([bool]$EntryPath -eq [bool]$EntryListPath){throw 'Supply exactly one EntryPath or private EntryListPath.'}
$requested=if($EntryListPath){if((Get-Item -LiteralPath $EntryListPath).Length -gt 1048576){throw 'Entry list byte limit.'};@([IO.File]::ReadAllText($EntryListPath)|ConvertFrom-Json)}else{@($EntryPath)}
if($requested.Count -lt 1 -or $requested.Count -gt 256){throw 'An export batch must contain 1..256 exact YBN paths.'}
$needles=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($pathValue in $requested){if($pathValue -isnot [string]){throw 'Entry list contains a non-string.'};$needle=$pathValue.Replace('\','/').ToLowerInvariant().TrimStart('/');if($needle -notmatch '\.ybn$' -or $needle -match '(^|/)\.\.(/|$)' -or !$needles.Add($needle)){throw 'Exact, unique YBN entry paths are required.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
foreach ($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) {[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $cw $name)))|Out-Null}
$netstandard=Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'netstandard.dll'
if(!(Test-Path -LiteralPath $netstandard)){$netstandard=Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'Facades\netstandard.dll'}
if(!(Test-Path -LiteralPath $netstandard)){throw '.NET Framework netstandard facade is required for the existing parser.'}
$references=@((Join-Path $cw 'CodeWalker.Core.dll'),(Join-Path $cw 'SharpDX.dll'),(Join-Path $cw 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll',$netstandard)
Add-Type -Path (Join-Path $repo 'src\acoustics\world\CodeWalkerCollisionAdapter.cs') -ReferencedAssemblies $references
if ($LoadKeys) {[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null)}
function ByteHash([byte[]]$Bytes) {$h=[Security.Cryptography.SHA256]::Create();try {([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function FileHash([string]$Path){$stream=[IO.File]::OpenRead($Path);$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose();$stream.Dispose()}}
function WritePrivateJson([string]$Path,$Value){$temp=$Path+'.pending';[IO.File]::WriteAllText($temp,($Value|ConvertTo-Json -Depth 16 -Compress),(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($Path)){[IO.File]::Replace($temp,$Path,[NullString]::Value)}else{[IO.File]::Move($temp,$Path)}}
function FindEntry($Rpf) {
    foreach($entry in $Rpf.AllEntries) {if($needles.Contains($entry.Path.Replace('\','/').ToLowerInvariant().TrimStart('/'))) {[pscustomobject]@{Rpf=$Rpf;Entry=$entry}}}
    foreach($child in $Rpf.Children) {FindEntry $child}
}
$before=Get-Item -LiteralPath $archivePath
$beforeLength=$before.Length;$beforeWrite=$before.LastWriteTimeUtc
$beforeHash=if($HashArchive){FileHash $archivePath}else{$null}
$rpf=New-Object CodeWalker.GameFiles.RpfFile($archivePath,$Archive)
$scanErrors=New-Object System.Collections.Generic.List[string]
$rpf.ScanStructure($null,[Action[string]]{param($m)$scanErrors.Add($m)})
if($rpf.LastError -or $scanErrors.Count){throw ('Archive scan failed: '+$rpf.LastError+' '+($scanErrors -join '; '))}
$matches=@(FindEntry $rpf)
if($matches.Count -ne $requested.Count){throw ('Expected '+$requested.Count+' exact entries, found '+$matches.Count+'. Use full catalogue paths including archive chains.')}
$pending=New-Object Collections.Generic.List[object]
$failures=New-Object Collections.Generic.List[object]
$parserHash=FileHash (Join-Path $cw 'CodeWalker.Core.dll')
foreach($match in $matches){
 try{
    if($match.Entry.FileSize -gt $MaxResourceBytes){throw 'Encoded resource exceeds byte limit.'}
    $data=$match.Rpf.ExtractFile($match.Entry)
    if(!$data -or $data.Length -gt $MaxResourceBytes){throw 'Extracted resource missing or over byte limit.'}
    $ybn=New-Object CodeWalker.GameFiles.YbnFile;$ybn.Load($data,$match.Entry)
    if(!$ybn.Loaded -or !$ybn.Bounds){throw 'YBN did not load collision bounds.'}
    $hash=ByteHash $data
    $normalized=[RichAudio.World.CodeWalkerCollisionAdapter]::Normalize($ybn.Bounds,$Archive,$match.Entry.Path.Replace('\','/'),$hash,$data.Length)
    if([Text.Encoding]::UTF8.GetByteCount($normalized) -gt 268435456){throw 'Normalized resource exceeds byte limit.'}
    $stem=if($requested.Count -eq 1){$hash.Substring(0,24)}else{(ByteHash ([Text.Encoding]::UTF8.GetBytes($match.Entry.Path+$hash))).Substring(0,24)}
    $rawPath=Join-Path $output ($stem+'.normalized.json')
    [IO.File]::WriteAllText($rawPath,$normalized,(New-Object Text.UTF8Encoding($false)))
    $resultText=& node (Join-Path $repo 'src\acoustics\world\convert-collision.mjs') $rawPath $output
    if($LASTEXITCODE -ne 0){throw 'Collision conversion failed; partial output has no qualified receipt.'}
    $result=$resultText|ConvertFrom-Json
    $pending.Add([pscustomobject]@{Entry=$match.Entry.Path.Replace('\','/');SourceSHA256=$hash;SourceBytes=$data.Length;Result=$result})
 }catch{
    if(!$EntryListPath){throw}
    $failures.Add([pscustomobject]@{Entry=$match.Entry.Path.Replace('\','/');State='resource-import-failed';Error=$_.Exception.Message})
 }
 WritePrivateJson (Join-Path $output 'batch-progress.json') ([ordered]@{Schema=1;Archive=$Archive;BeforeSHA256=$beforeHash;ArchiveIntegrityState='awaiting-after-sha256';Resources=@($pending.ToArray());Failures=@($failures.ToArray())})
}
$after=Get-Item -LiteralPath $archivePath
$afterHash=if($HashArchive){FileHash $archivePath}else{$null}
$unchanged=($beforeLength -eq $after.Length -and $beforeWrite -eq $after.LastWriteTimeUtc -and (!$HashArchive -or $beforeHash -eq $afterHash))
if(!$unchanged){throw 'Archive integrity changed during read-only export.'}
$receipts=New-Object Collections.Generic.List[object]
foreach($item in $pending){
    $receipt=[pscustomobject]@{Schema=1;Archive=$Archive;Entry=$item.Entry;SourceSHA256=$item.SourceSHA256;SourceBytes=$item.SourceBytes;ArchiveUnchanged=$unchanged;ArchiveVerification=if($HashArchive){'sha256-before-after'}else{'length-and-mtime-only'};BeforeSHA256=$beforeHash;AfterSHA256=$afterHash;ParserSHA256=$parserHash;Result=$item.Result;WorldPlacementVerified=$false;RuntimeUse='none';Pending=@('YMAP/YTYP placements','MLO/interior transforms and portals','runtime activation and override precedence','unsupported bound and polygon families','acoustic material mapping','renderer integration')}
    $receiptPath=Join-Path $output ('receipt-'+$item.Result.resourceId+'.json');WritePrivateJson $receiptPath $receipt
    $receipts.Add([pscustomobject]@{Entry=$item.Entry;ReceiptPath=$receiptPath;Receipt=$receipt})
}
$batch=[ordered]@{Schema=1;Archive=$Archive;ArchiveUnchanged=$unchanged;BeforeSHA256=$beforeHash;AfterSHA256=$afterHash;Resources=@($receipts.ToArray());Failures=@($failures.ToArray())}
WritePrivateJson (Join-Path $output 'batch-receipt.json') $batch
if(!$EntryListPath){WritePrivateJson (Join-Path $output 'receipt.json') $receipts[0].Receipt;$receipts[0].Receipt|ConvertTo-Json -Depth 12}else{$batch|ConvertTo-Json -Depth 16}
