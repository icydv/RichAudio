#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$GameRoot,
    [Parameter(Mandatory)][string]$CodeWalkerCore,
    [Parameter(Mandatory)][string]$RetainedRelDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out = [IO.Path]::GetFullPath($OutputDirectory)
if (!$out.StartsWith((Join-Path $repo '.local') + '\', [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $out)) { throw 'Choose a fresh private output under .local.' }
for ($path = $out; $path; $path = [IO.Path]::GetDirectoryName($path)) {
    if ((Test-Path -LiteralPath $path) -and
        ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Linked output path refused.'
    }
}

function Require([bool]$condition, [string]$reason) { if (!$condition) { throw $reason } }
function Digest([byte[]]$bytes) { [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() }
function HashName([string]$name) { [CodeWalker.GameFiles.JenkHash]::GenHash($name.ToLowerInvariant()) }

$gameRoot = [IO.Path]::GetFullPath($GameRoot)
$exe = Join-Path $gameRoot 'GTA5_Enhanced.exe'
$gameRelPath = Join-Path $RetainedRelDirectory 'game.dat151.rel'
$soundRelPath = Join-Path $RetainedRelDirectory 'sounds.dat54.rel'
$pins = @{
    $exe = 'b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea'
    $CodeWalkerCore = '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'
    $gameRelPath = '82e4e02e62293d6fd3b0c22e0fde4b38acb4d96584dc9d7211f4819157e8b5fa'
    $soundRelPath = '22603a9f4fefd720387cf37fea031b09194f08d7f32c44c4cd9a1be3a72ad804'
}
foreach ($path in $pins.Keys) { Require ((Get-FileHash -LiteralPath $path).Hash -eq $pins[$path]) "Unexpected input $path" }
foreach ($dll in 'SharpDX.dll', 'SharpDX.Mathematics.dll') {
    [void][Reflection.Assembly]::LoadFrom((Join-Path (Split-Path -Parent $CodeWalkerCore) $dll))
}
[void][Reflection.Assembly]::LoadFrom($CodeWalkerCore)
# Same read-only dev46 bootstrap as the installed audio resource inspection.
$noop = [Action[string]]{ param($message) }
[CodeWalker.GameFiles.GTA5Keys]::GenerateV2([IO.File]::ReadAllBytes($exe), $noop)
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath((Join-Path $repo '.local'),
    [Convert]::ToBase64String([CodeWalker.GameFiles.GTA5Keys]::PC_AES_KEY))
$archivePath = 'x64/audio/sfx/STREAMED_VEHICLES.rpf'
$archive = [CodeWalker.GameFiles.RpfFile]::new((Join-Path $gameRoot $archivePath), $archivePath)
$errors = [Collections.Generic.List[string]]::new()
$archive.ScanStructure($noop, [Action[string]]{ param($message) $errors.Add($message) })
Require (!$archive.LastError -and !$errors.Count) 'Could not read the stock streamed vehicle archive.'
$entries = @($archive.AllEntries | Where-Object Name -CEQ 'rc_motor.awc')
Require ($entries.Count -eq 1) 'Expected one rc_motor.awc.'
$stockBank = $archive.ExtractFile($entries[0])
$stockBankHash = '3d00ab5342b9c5f6f4cd8720134f82bc1909a97b8dd0b76c68d6c2330fcf471d'
Require ((Digest $stockBank) -ceq $stockBankHash) 'Stock RC motor bank differs.'

function ReadRel([byte[]]$bytes) {
    $rel = [CodeWalker.GameFiles.RelFile]::new()
    $rel.Load($bytes, $null)
    return $rel
}
function ReadAwc([byte[]]$bytes) {
    $entry = [CodeWalker.GameFiles.RpfBinaryFileEntry]::new()
    $entry.Name = 'rc_motor.awc'
    $bank = [CodeWalker.GameFiles.AwcFile]::new()
    $bank.Load($bytes, $entry)
    Require (!$bank.ErrorMessage) 'AWC read failed.'
    return $bank
}
function Record([xml]$xml, [string]$kind, [string]$hash, [string]$type) {
    $node = $xml.SelectSingleNode("/$kind/Items/Item[Name='hash_$hash']")
    Require ($node -and $node.GetAttribute('type') -ceq $type) "Unexpected $type $hash"
    $copy = $node.CloneNode($true)
    if ($copy.HasAttribute('ntOffset')) { $copy.SetAttribute('ntOffset', '0') }
    return ,$copy
}
function SetText($record, [string]$field, [string]$value) {
    $node = $record.SelectSingleNode($field)
    Require ([bool]$node) "Missing $field in $($record.Name)"
    $node.InnerText = $value
}
function EncodeRel([string]$kind, [object[]]$records, [string[]]$containers = @()) {
    $paths = if ($containers.Count) {
        '<ContainerPaths>' + (($containers | ForEach-Object { '<Item>' + $_ + '</Item>' }) -join '') + '</ContainerPaths>'
    } else { '' }
    [xml]$doc = "<$kind><Version value='72079594'/>$paths<Items>" +
        (($records | ForEach-Object OuterXml) -join '') + "</Items></$kind>"
    return ,([CodeWalker.GameFiles.XmlRel]::GetRel($doc).Save())
}
function ChunkBytes($chunk) {
    $stream = [IO.MemoryStream]::new()
    try {
        $chunk.Write([CodeWalker.GameFiles.DataWriter]::new($stream))
        return ,$stream.ToArray()
    } finally { $stream.Dispose() }
}

$baseGame = ReadRel ([IO.File]::ReadAllBytes($gameRelPath))
$baseSound = ReadRel ([IO.File]::ReadAllBytes($soundRelPath))
[xml]$gameXml = [CodeWalker.GameFiles.RelXml]::GetXml($baseGame)
[xml]$soundXml = [CodeWalker.GameFiles.RelXml]::GetXml($baseSound)
$adder = Record $gameXml 'Dat151' 'B779A091' 'Vehicle'
$rcEngine = Record $gameXml 'Dat151' '1C4FDA16' 'VehicleEngine'
$rcLoop = Record $soundXml 'Dat54' 'F50A1575' 'SimpleSound'
Require ($adder.SelectSingleNode('Horns').InnerText -ceq 'hash_F7725613') 'Unexpected ADDER horn.'
Require ($baseSound.RelDataDict.ContainsKey([uint32]0xF7725613L)) 'Stock horn list is missing.'
Require ($rcLoop.SelectSingleNode('ContainerName').InnerText -ceq 'hash_4E9B0624' -and
    $rcLoop.SelectSingleNode('FileName').InnerText -ceq 'hash_AF479EA3') 'Unexpected RC loop resolution.'
$source = ReadAwc $stockBank
$sourceStream = @($source.Streams | Where-Object { $_.Hash.Hash -eq 0x0F479EA3 })
Require ($sourceStream.Count -eq 1 -and $sourceStream[0].SampleCount -eq 104163 -and
    $sourceStream[0].SamplesPerSecond -eq 44100 -and [int]$sourceStream[0].FormatChunk.Codec -eq 0) 'Unexpected RC loop stream.'
$sourceStream = $sourceStream[0]
$sourcePcm = $sourceStream.GetPcmData()
$sourceFormat = ChunkBytes $sourceStream.FormatChunk
Require ((Digest $sourcePcm) -ceq '0fee3d6d1ff39a9880646e69cc01070f79d1dca0b978ac0dedcf9cde59a438ab') 'RC loop PCM differs.'
$stockSilent = @($source.Streams | Where-Object { $_.Hash.Hash -eq 0x1743BA85 })
Require ($stockSilent.Count -eq 1 -and (Digest $stockSilent[0].GetPcmData()) -ceq
    'cc5e4944a985afa0160ad346863fde89add29d045f46d28429a6f5f7b96d6d43') 'Expected stock silent companion stream.'

# Bind the nonzero RC loop explicitly at idle, low/high load and lift-off.
# Carry the silent exhaust-low, exhaust-idle and intake in both variants.
# Remove shared transmission synthesis and hybrid distant start from both.
$motorFields = @('EngineLow', 'EngineHigh', 'EngineIdleLoop', 'ExhaustHigh', 'RevsOff')
$variants = foreach ($label in 'audible', 'quiet') {
    [ordered]@{
        label = $label
        profile = "ra_rc_$label"
        engine = "ra_rc_$($label)_engine"
        sound = "ra_rc_$($label)_loop"
        bank = "ra_rc_$label.awc"
        container = "dlc_ra_rc_9f6c2b57/ra_rc_$label"
    }
}
$hashes = @($variants | ForEach-Object { $_.profile, $_.engine, $_.sound, $_.container } | ForEach-Object { HashName $_ })
Require (($hashes | Sort-Object -Unique).Count -eq $hashes.Count) 'Private hash collision.'
foreach ($hash in $hashes) {
    Require (!$baseGame.RelDataDict.ContainsKey($hash) -and !$baseSound.RelDataDict.ContainsKey($hash)) 'Private record collides with base stock REL.'
}
$baseContainers = @($baseSound.NameTable | ForEach-Object { HashName $_.Replace('\', '/') })
$gameRows = @()
$soundRows = @()
foreach ($variant in $variants) {
    Require ((HashName $variant.container) -notin $baseContainers) 'Private container collides with base stock REL.'
    $root = $adder.CloneNode($true)
    SetText $root 'Name' $variant.profile
    SetText $root 'Engine' $variant.engine
    SetText $root 'EngineGranular' ''
    # Use the flags of stock Khamelion, which has conventional engine audio.
    $root.SelectSingleNode('Flags').SetAttribute('value', '0x90004A68')
    $engine = $rcEngine.CloneNode($true)
    SetText $engine 'Name' $variant.engine
    foreach ($field in $motorFields) { SetText $engine $field $variant.sound }
    SetText $engine 'Transmission' 'null_sound'
    SetText $engine 'DistantStart' 'null_sound'
    $sound = $rcLoop.CloneNode($true)
    SetText $sound 'Name' $variant.sound
    SetText $sound 'ContainerName' $variant.container
    $gameRows += @($root, $engine)
    $soundRows += $sound
}
$gameBytes = EncodeRel 'Dat151' $gameRows
$containers = @($variants | ForEach-Object { $_.container.Replace('/', '\').ToUpperInvariant() })
$soundBytes = EncodeRel 'Dat54' $soundRows $containers

[void][IO.Directory]::CreateDirectory($out)
[IO.File]::WriteAllBytes((Join-Path $out 'ra_rc_game.dat151.rel'), $gameBytes)
[IO.File]::WriteAllBytes((Join-Path $out 'ra_rc_sounds.dat54.rel'), $soundBytes)
$readGame = ReadRel ([IO.File]::ReadAllBytes((Join-Path $out 'ra_rc_game.dat151.rel')))
$readSound = ReadRel ([IO.File]::ReadAllBytes((Join-Path $out 'ra_rc_sounds.dat54.rel')))
Require ($readGame.RelDatas.Count -eq 4 -and (Digest $readGame.Save()) -ceq (Digest $gameBytes) -and
    $readSound.RelDatas.Count -eq 2 -and (Digest $readSound.Save()) -ceq (Digest $soundBytes)) 'REL roundtrip differs.'
foreach ($variant in $variants) {
    $root = $readGame.RelDataDict[(HashName $variant.profile)]
    $engine = $readGame.RelDataDict[(HashName $variant.engine)]
    $sound = $readSound.RelDataDict[(HashName $variant.sound)]
    Require ($root.Type -eq 'Vehicle' -and $root.Engine.Hash -eq (HashName $variant.engine) -and
        $root.Horns.Hash -eq 0xF7725613L -and !$root.EngineGranular.Hash -and !$root.ElectricEngine.Hash) 'Reopened vehicle graph differs.'
    Require ($engine.Type -eq 'VehicleEngine' -and $sound.Type -eq 'SimpleSound') 'Reopened motor graph type differs.'
    foreach ($field in $motorFields) {
        Require ($engine.$field.Hash -eq (HashName $variant.sound)) "Reopened $field motor branch differs."
    }
    Require ($engine.Transmission.Hash -eq (HashName 'null_sound') -and
        $engine.DistantStart.Hash -eq (HashName 'null_sound')) 'Reopened unrelated motor branch differs.'
    Require ($sound.ContainerName.Hash -eq (HashName $variant.container) -and $sound.FileName.Hash -eq 0xAF479EA3L) 'Reopened wave reference differs.'
    $bank = ReadAwc ([byte[]]$stockBank.Clone())
    $sample = @($bank.Streams | Where-Object { $_.Hash.Hash -eq 0x0F479EA3 })[0]
    $bank.Streams = [CodeWalker.GameFiles.AwcStream[]]@($sample)
    $bank.WholeFileEncrypted = $false
    $bank.SingleChannelEncryptFlag = $false
    $bank.MultiChannelEncryptFlag = $false
    $pcm = [byte[]]$sourcePcm.Clone()
    if ($variant.label -ceq 'quiet') {
        [Array]::Clear($pcm)
        $sample.DataChunk.Data = $pcm
        $bank.BuildPeakChunks()
    }
    $bank.BuildChunkIndices()
    $bank.BuildStreamInfos()
    $bank.BuildStreamDict()
    $path = Join-Path $out $variant.bank
    [IO.File]::WriteAllBytes($path, $bank.Save())
    $reopened = ReadAwc ([IO.File]::ReadAllBytes($path))
    Require ($reopened.Streams.Count -eq 1) 'Expected one reopened private motor stream.'
    $wave = $reopened.Streams[0]
    Require ($wave.Hash.Hash -eq 0x0F479EA3 -and (Digest $wave.GetPcmData()) -ceq (Digest $pcm)) 'Private AWC audio differs.'
    $format = ChunkBytes $wave.FormatChunk
    # The existing idle resource builder masks only the peak sample field.
    $format[20] = $sourceFormat[20]
    $format[21] = $sourceFormat[21]
    Require ((Digest $format) -ceq (Digest $sourceFormat)) 'Non-peak format bytes changed.'
    $sourceChunks = @($sourceStream.Chunks | ForEach-Object { [string]$_.ChunkInfo.Type } | Sort-Object)
    $privateChunks = @($wave.Chunks | ForEach-Object { [string]$_.ChunkInfo.Type } | Sort-Object)
    Require (!(Compare-Object $sourceChunks $privateChunks)) 'Private stream chunk set changed.'
    foreach ($chunk in $wave.Chunks) {
        $type = [string]$chunk.ChunkInfo.Type
        if ($type -in 'data', 'format' -or ($variant.label -ceq 'quiet' -and $type -eq 'peak')) { continue }
        $original = @($sourceStream.Chunks | Where-Object { [string]$_.ChunkInfo.Type -ceq $type })
        Require ($original.Count -eq 1 -and (Digest (ChunkBytes $chunk)) -ceq (Digest (ChunkBytes $original[0]))) "Unexpected change in $type chunk."
    }
    $variant.pcmSha256 = Digest $pcm
}

function Normalize($node) {
    $copy = $node.CloneNode($true)
    if ($copy.HasAttribute('ntOffset')) { $copy.SetAttribute('ntOffset', '0') }
    foreach ($variant in $variants) {
        foreach ($field in 'profile', 'engine', 'sound', 'container') {
            $name = $variant[$field]
            $xmlHash = 'hash_{0:X8}' -f (HashName $name)
            foreach ($item in $copy.SelectNodes('.//*')) {
                if ($item.InnerText -ieq $name -or $item.InnerText -ieq $xmlHash) { $item.InnerText = "private_$field" }
            }
        }
    }
    return $copy.OuterXml
}
# Normalize private identities and compare all parsed REL fields across the pair.
foreach ($rel in $readGame, $readSound) {
    [xml]$xml = [CodeWalker.GameFiles.RelXml]::GetXml($rel)
    $records = @($xml.SelectNodes('/*/Items/Item'))
    foreach ($kind in ($records | ForEach-Object { $_.GetAttribute('type') } | Sort-Object -Unique)) {
        $pair = @($records | Where-Object { $_.GetAttribute('type') -ceq $kind })
        Require ($pair.Count -eq 2) "Expected two $kind records."
        Require ((Normalize $pair[0]) -ceq (Normalize $pair[1])) "Parsed $kind variants differ beyond private references."
    }
}

$files = @(Get-ChildItem -LiteralPath $out -File | Sort-Object Name | ForEach-Object {
    @{path = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant(); bytes = $_.Length}
})
@{
    pack = 'ra_rc_9f6c2b57'
    device = 'dlc_ra_rc_9f6c2b57'
    stockBank = @{path = "$archivePath/rc_motor.awc"; sha256 = $stockBankHash}
    inputSha256 = $pins
    variants = @($variants)
    files = $files
    coverage = @{motorFields = $motorFields; removedFromBoth = @('Transmission', 'DistantStart'); horn = 'F7725613'}
    verified = @{matchedRel = $true; reopenedRel = $true; reopenedAwc = $true; pcm = $true}
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'resource-manifest.json') -Encoding utf8
Write-Output (Join-Path $out 'resource-manifest.json')
