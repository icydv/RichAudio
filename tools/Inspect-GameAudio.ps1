# Run with Windows PowerShell 5.1 (CodeWalker dev46 targets .NET Framework).
[CmdletBinding()]
param(
    [string]$GameRoot = '__GAME_ROOT__',
    [string]$CodeWalkerRoot = '__USER_HOME__\Desktop\CodeWalker30_dev46',
    [string]$OutputRoot = '',
    [string[]]$Archives = @('x64\audio\audio_rel.rpf','x64\audio\occlusion.rpf','x64\audio\sfx\STREAMED_VEHICLES_GRANULAR.rpf','x64\audio\sfx\STREAMED_VEHICLES_GRANULAR_NPC.rpf','update\update.rpf','common.rpf'),
    [switch]$LoadKeys,
    [string]$AwcNamePattern = '^(1000cc_racebike_1|sanchez)(_npc)?\.awc$',
    [switch]$SampleGeometry,
    [string]$OpenRpfRoot = '__USER_HOME__\Downloads\6d0158-OpenRPF'
)
$ErrorActionPreference = 'Stop'
if (!$OutputRoot) { $OutputRoot = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\.local\inspection' }
$game = [IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
$cw = [IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$output = [IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
foreach ($inputRoot in @($game,$cw,[IO.Path]::GetFullPath($OpenRpfRoot).TrimEnd('\'))) {
    if ($output.Equals($inputRoot,[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be outside input directories.' }
}
[IO.Directory]::CreateDirectory($output) | Out-Null
# Byte-load existing trusted local assemblies: no Unblock-File, installation or source changes.
foreach ($dll in Get-ChildItem -LiteralPath $cw -Filter '*.dll') {
    [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName)) | Out-Null
}
if ($LoadKeys) { [CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null) }
$inventory = New-Object System.Collections.Generic.List[object]
$summary = New-Object System.Collections.Generic.List[object]
$script:sampledYmt = $false
$script:sampledYbn = $false
function Measure-Bounds($bounds) {
    if (!$bounds) { return }
    [pscustomobject]@{Type=$bounds.GetType().Name;Vertices=if($bounds.Vertices){$bounds.Vertices.Length}else{0};Polygons=if($bounds.Polygons){$bounds.Polygons.Length}else{0};Materials=if($bounds.Materials){$bounds.Materials.Length}else{0};ChildTransforms=if($bounds.ChildrenTransformation1){$bounds.ChildrenTransformation1.Length}else{0}}
    foreach ($child in $bounds.Children.data_items) { Measure-Bounds $child }
}
function Read-Archive($rpf) {
    foreach ($entry in $rpf.AllEntries) {
        $inventory.Add([pscustomobject]@{Archive=$rpf.Path;Name=$entry.Name;Path=$entry.Path;Type=$entry.GetType().Name})
        if ($entry.Name -match '\.rel$') {
            try {
                $data=$rpf.ExtractFile($entry)
                if (!$data) { throw ('No bytes: '+$rpf.LastError) }
                $rel=New-Object CodeWalker.GameFiles.RelFile
                $rel.Load($data,$entry)
                $stem=($entry.Path -replace '[^a-zA-Z0-9_.-]','_')
                [IO.File]::WriteAllText((Join-Path $output ($stem+'.xml')),[CodeWalker.GameFiles.RelXml]::GetXml($rel))
                $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='REL';RelType=[int]$rel.RelType;Records=$rel.RelDatas.Count;Bytes=$data.Length;Error=$null})
            } catch { $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='REL';Error=$_.Exception.Message}) }
        }
        if ($entry.Name -match '^vehicles\.meta$') {
            try {
                $data=$rpf.ExtractFile($entry)
                if (!$data) { throw ('No bytes: '+$rpf.LastError) }
                $stem=($entry.Path -replace '[^a-zA-Z0-9_.-]','_')
                [IO.File]::WriteAllBytes((Join-Path $output ($stem+'.xml')),$data)
                $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='VehicleMeta';Bytes=$data.Length;Error=$null})
            } catch { $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='VehicleMeta';Error=$_.Exception.Message}) }
        }
        if ($SampleGeometry -and (($entry.Name -match '\.ymt$' -and $rpf.Path -like '*occlusion*' -and !$script:sampledYmt) -or ($entry.Name -match '\.ybn$' -and !$script:sampledYbn))) {
            try {
                $data=$rpf.ExtractFile($entry)
                if (!$data) { throw ('No bytes: '+$rpf.LastError) }
                if ($entry.Name -match '\.ymt$') {
                    $script:sampledYmt=$true
                    $ymt=New-Object CodeWalker.GameFiles.YmtFile
                    $ymt.Load($data,$entry)
                    $name=''
                    $xml=[CodeWalker.GameFiles.MetaXml]::GetXml($ymt,[ref]$name)
                    [IO.File]::WriteAllText((Join-Path $output 'occlusion-sample.xml'),$xml)
                    $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='OcclusionYmt';Bytes=$data.Length;Loaded=$ymt.Loaded;XmlChars=$xml.Length;Error=$null})
                } else {
                    $script:sampledYbn=$true
                    $ybn=New-Object CodeWalker.GameFiles.YbnFile
                    $ybn.Load($data,$entry)
                    $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='CollisionYbn';Bytes=$data.Length;Loaded=$ybn.Loaded;BoundsType=$ybn.Bounds.GetType().Name;Nodes=@(Measure-Bounds $ybn.Bounds);Error=$null})
                }
            } catch { $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='GeometrySample';Error=$_.Exception.Message}) }
        }
        if ($entry.Name -match $AwcNamePattern) {
            try {
                $data=$rpf.ExtractFile($entry)
                if (!$data) { throw ('No bytes: '+$rpf.LastError) }
                $awc=New-Object CodeWalker.GameFiles.AwcFile
                $awc.Load($data,$entry)
                $streams=@($awc.Streams | ForEach-Object { [pscustomobject]@{Hash=$_.Hash.Hex;Name=$_.Name;SampleCount=$_.SampleCount;Format=$_.FormatChunk} })
                $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='AWC';Version=$awc.Version;StreamCount=$awc.StreamCount;Bytes=$data.Length;Streams=$streams;Error=$awc.ErrorMessage})
            } catch { $summary.Add([pscustomobject]@{Path=$entry.Path;Kind='AWC';Error=$_.Exception.Message}) }
        }
    }
    foreach ($child in $rpf.Children) { Read-Archive $child }
}
$baseline=@()
foreach ($relative in $Archives) {
    $path=[IO.Path]::GetFullPath((Join-Path $game $relative))
    if (!$path.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive escaped game root.' }
    $info=Get-Item -LiteralPath $path
    $before=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    $rpf=New-Object CodeWalker.GameFiles.RpfFile($path,$relative)
    $errors=New-Object System.Collections.Generic.List[string]
    $rpf.ScanStructure($null,[Action[string]]{param($m) $errors.Add($m)})
    Read-Archive $rpf
    $after=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    $baseline += [pscustomobject]@{Path=$relative;Length=$info.Length;BeforeSHA256=$before;AfterSHA256=$after;Unchanged=($before -eq $after);Entries=$rpf.AllEntries.Count;Children=$rpf.Children.Count;LastError=$rpf.LastError;Errors=@($errors.ToArray())}
    if ($before -ne $after) { throw ('Input changed: '+$relative) }
}
$inventory | Export-Csv -LiteralPath (Join-Path $output 'inventory.csv') -NoTypeInformation
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'parse-summary.json') -Encoding UTF8
$baseline | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'archive-integrity.json') -Encoding UTF8
$baseline | Format-Table Path,Entries,Children,Unchanged,LastError -AutoSize
$summary | Group-Object Kind,Error | Select-Object Name,Count | Format-Table -AutoSize
if (@($summary | Where-Object Error).Count -or @($baseline | Where-Object { $_.LastError -or $_.Errors.Count }).Count) { throw 'Inspection had parse errors; inspect the saved summaries.' }
