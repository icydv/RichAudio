Set-StrictMode -Version 2

function Get-CatalogByteHash([byte[]]$Bytes) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-CatalogXml([byte[]]$Bytes) {
    if(!$Bytes -or $Bytes.Length -gt 16MB){throw 'Bounded XML bytes required'}
    $settings=New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver=$null
    $settings.MaxCharactersInDocument=16MB
    $stream=New-Object IO.MemoryStream(,$Bytes)
    $reader=[Xml.XmlReader]::Create($stream,$settings)
    try { $doc=New-Object Xml.XmlDocument; $doc.XmlResolver=$null; $doc.Load($reader); return ,$doc }
    finally { $reader.Dispose(); $stream.Dispose() }
}

function Get-CatalogDlcDeclarations($Document) {
    $items=@($Document.SelectNodes('//Paths/Item'))
    if($items.Count -gt 512){throw 'DLC declaration bound exceeded'}
    for($i=0;$i -lt $items.Count;$i++){
        $route=$items[$i].InnerText.Trim()
        $pack=$null
        if($route -match '^dlcpacks:/([A-Za-z0-9_-]+)/?$'){$pack=$Matches[1]}
        [pscustomobject]@{Index=$i;Route=$route;Pack=$pack;SupportedPath=($null -ne $pack)}
    }
}

function Get-CatalogVehicleDeclarations($Document,[string]$Source) {
    $items=@($Document.SelectNodes('//InitDatas/Item[modelName]'))
    if($items.Count -gt 20000){throw 'Vehicle declaration bound exceeded'}
    foreach($item in $items){
        $values=@{}
        foreach($name in @('modelName','audioNameHash','vehicleClass','type')){
            $node=$item.SelectSingleNode($name)
            $values[$name]=if($node){$node.InnerText.Trim()}else{''}
        }
        if(!$values.modelName -or $values.modelName.Length -gt 128){throw 'Bounded model identity required'}
        [pscustomobject]@{Model=$values.modelName;AudioNameHash=$values.audioNameHash;
            VehicleClass=$values.vehicleClass;VehicleType=$values.type;Source=$Source;
            AudioIdentifier=if($values.audioNameHash){$values.audioNameHash}else{$values.modelName};
            AudioSelectionBasis=if($values.audioNameHash){'declared-audioNameHash'}else{'model-name-fallback-inferred-not-runtime-observed'}}
    }
}

function Get-CatalogManifestDeclarations($Document,[string]$Source) {
    $items=@($Document.SelectNodes('//*[fileType]'))
    if($items.Count -gt 40000){throw 'Manifest declaration bound exceeded'}
    foreach($item in $items){
        $file=$item.SelectSingleNode('filename');$kind=$item.SelectSingleNode('fileType');$disabled=$item.SelectSingleNode('disabled')
        if(!$file -or !$kind){continue}
        [pscustomobject]@{Filename=$file.InnerText.Trim();FileType=$kind.InnerText.Trim();
            DisabledDeclaration=if($disabled){$disabled.GetAttribute('value')}else{$null};Source=$Source;
            RuntimeActivation='unresolved-changesets-not-evaluated'}
    }
}

function Get-CatalogModelSummary([object[]]$Declarations) {
    foreach($group in @($Declarations | Group-Object { $_.Model.ToLowerInvariant() } | Sort-Object Name)){
        $variants=@($group.Group | ForEach-Object { $_.AudioIdentifier.ToLowerInvariant() } | Sort-Object -Unique)
        [pscustomobject]@{Model=$group.Name;DeclarationCount=$group.Count;AudioIdentifiers=$variants;
            ConflictingAudioDeclarations=($variants.Count -gt 1);EffectiveRuntimeSelection='unresolved';
            Sources=@($group.Group | ForEach-Object Source | Sort-Object -Unique)}
    }
}

function Get-CatalogArchiveFingerprint($Stamp) {
    # Ordered fields include mount index and parser/game bindings, not only an archive filename.
    return Get-CatalogByteHash ([Text.Encoding]::UTF8.GetBytes(($Stamp|ConvertTo-Json -Depth 5 -Compress)))
}

function Resolve-CatalogArchivePath([string]$GameRoot,[string]$Relative) {
    if(!$Relative -or [IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)|[:\x00]'){
        throw 'Archive path must be game-relative without traversal'
    }
    $root=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
    $path=[IO.Path]::GetFullPath((Join-Path $root $Relative))
    if(!$path.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Archive escaped game root'}
    for($part=[IO.FileInfo]::new($path);$null -ne $part;){
        if((Test-Path -LiteralPath $part.FullName) -and ((Get-Item -LiteralPath $part.FullName -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked archive path unsupported'}
        $parent=Split-Path $part.FullName -Parent
        if(!$parent -or $parent -eq $part.FullName){break};$part=[IO.FileInfo]::new($parent)
    }
    return $path
}

Export-ModuleMember -Function Get-CatalogByteHash,Read-CatalogXml,Get-CatalogDlcDeclarations,Get-CatalogVehicleDeclarations,Get-CatalogManifestDeclarations,Get-CatalogModelSummary,Get-CatalogArchiveFingerprint,Resolve-CatalogArchivePath
