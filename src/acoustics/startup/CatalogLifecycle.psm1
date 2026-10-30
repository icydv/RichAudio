Set-StrictMode -Version 2

function Assert-CatalogPrivatePath {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$PrivateRoot,
          [Parameter(Mandatory=$true)][string]$Path)
    if(![IO.Path]::IsPathRooted($PrivateRoot) -or ![IO.Path]::IsPathRooted($Path)){
        throw 'Absolute private root and destination required'
    }
    $root=[IO.Path]::GetFullPath($PrivateRoot).TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
    $resolved=[IO.Path]::GetFullPath($Path)
    if(!$resolved.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
        throw 'Catalogue destination escaped its private output root'
    }
    for($part=[IO.FileInfo]::new($resolved);$null -ne $part;){
        $item=Get-Item -LiteralPath $part.FullName -Force -ErrorAction SilentlyContinue
        if($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){
            throw 'Reparse-point catalogue path unsupported'
        }
        $parent=Split-Path $part.FullName -Parent
        if(!$parent -or $parent -eq $part.FullName){break}
        $part=[IO.FileInfo]::new($parent)
    }
    return $resolved
}

function Write-CatalogAtomicJson {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$PrivateRoot,
          [Parameter(Mandatory=$true)][string]$Path,
          [Parameter(Mandatory=$true)][AllowNull()]$Value,
          [ValidateRange(1,268435456)][int]$MaximumBytes=67108864,
          [ValidateRange(1,32)][int]$Depth=18,
          [scriptblock]$BeforePublish)
    $destination=Assert-CatalogPrivatePath $PrivateRoot $Path
    $json=ConvertTo-Json -InputObject $Value -Depth $Depth -Compress
    $bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes($json)
    if($bytes.Length -gt $MaximumBytes){throw 'Catalogue JSON exceeds publication byte bound'}
    $directory=[IO.Path]::GetDirectoryName($destination)
    [IO.Directory]::CreateDirectory($directory)|Out-Null
    [void](Assert-CatalogPrivatePath $PrivateRoot $destination)
    $pending=Join-Path $directory ('.'+[IO.Path]::GetFileName($destination)+'.pending-'+[Guid]::NewGuid().ToString('N'))
    [void](Assert-CatalogPrivatePath $PrivateRoot $pending)
    $stream=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    # This test hook runs after a complete private pending file exists. A failure
    # preserves that evidence and leaves the published file untouched.
    if($BeforePublish){& $BeforePublish $pending}
    [void](Assert-CatalogPrivatePath $PrivateRoot $pending)
    [void](Assert-CatalogPrivatePath $PrivateRoot $destination)
    if([IO.File]::Exists($destination)){
        [IO.File]::Replace($pending,$destination,[System.Management.Automation.Language.NullString]::Value)
    }else{
        [IO.File]::Move($pending,$destination)
    }
    return [pscustomobject]@{Path=$destination;Bytes=$bytes.Length;Published=$true}
}

function Read-CatalogCacheJson {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$PrivateRoot,
          [Parameter(Mandatory=$true)][string]$Path,
          [ValidateRange(1,268435456)][int]$MaximumBytes=67108864,
          [ValidateRange(1,2147483647)][int]$ExpectedSchema=1,
          [string]$ExpectedFingerprint='')
    $source=Assert-CatalogPrivatePath $PrivateRoot $Path
    if(![IO.File]::Exists($source)){return $null}
    $invalid=(Get-Item -LiteralPath $source).Length -gt $MaximumBytes
    $value=$null
    if(!$invalid){
        # Access/sharing failures remain actual IO failures; they are not treated
        # as corrupt JSON and must not rename a file another process is using.
        $bytes=[IO.File]::ReadAllBytes($source)
        try{
            $json=[Text.UTF8Encoding]::new($false,$true).GetString($bytes)
            $value=ConvertFrom-Json -InputObject $json -ErrorAction Stop
            $schema=if($null -ne $value){$value.PSObject.Properties['Schema']}else{$null}
            $fingerprint=if($null -ne $value){$value.PSObject.Properties['Fingerprint']}else{$null}
            $invalid=($null -eq $schema -or $schema.Value -ne $ExpectedSchema -or
                ($ExpectedFingerprint -and ($null -eq $fingerprint -or $fingerprint.Value -ne $ExpectedFingerprint)))
        }catch{$invalid=$true}
    }
    if(!$invalid){return $value}
    $quarantine=$source+'.invalid-'+[Guid]::NewGuid().ToString('N')+'.json'
    [void](Assert-CatalogPrivatePath $PrivateRoot $quarantine)
    [void](Assert-CatalogPrivatePath $PrivateRoot $source)
    [IO.File]::Move($source,$quarantine)
    return $null
}

function New-CatalogRunStatus {
    [CmdletBinding()]
    param([DateTime]$NowUtc=[DateTime]::UtcNow)
    return [pscustomobject]@{State='launching';RunId=[Guid]::NewGuid().ToString('N');StartedUtc=$NowUtc.ToUniversalTime().ToString('o');Completed=$false}
}

function Test-CatalogArchiveDeadline {
    [CmdletBinding()]
    param([AllowNull()]$Status,
          [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9-]{1,64}$')][string]$RunId,
          [ValidateRange(1,3600)][int]$MaximumArchiveSeconds,
          [DateTime]$NowUtc=[DateTime]::UtcNow)
    if($null -eq $Status){return $false}
    $id=$Status.PSObject.Properties['RunId'];$state=$Status.PSObject.Properties['State'];$started=$Status.PSObject.Properties['ArchiveStartedUtc']
    if($null -eq $id -or $id.Value -cne $RunId -or $null -eq $state -or $state.Value -ne 'scanning' -or $null -eq $started){return $false}
    $archiveStart=[DateTime]::MinValue
    if(![DateTime]::TryParse([string]$started.Value,[Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind,[ref]$archiveStart)){return $false}
    return ($NowUtc.ToUniversalTime()-$archiveStart.ToUniversalTime()).TotalSeconds -gt $MaximumArchiveSeconds
}

function Add-CatalogEntryWork {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)]$CurrentCount,
          [Parameter(Mandatory=$true)]$EntryCount,
          [ValidateRange(1,2000000)][long]$MaximumCount=2000000)
    $counts=@($CurrentCount,$EntryCount)
    foreach($count in $counts){
        if($null -eq $count -or $count -is [bool]){throw 'Nonnegative integer entry count required'}
        try{$integer=[long]$count;$exact=[decimal]$count}catch{throw 'Nonnegative integer entry count required'}
        if($integer -lt 0 -or $exact -ne $integer -or $integer -gt $MaximumCount){throw 'Nonnegative bounded integer entry count required'}
    }
    $total=[long]$CurrentCount+[long]$EntryCount
    if($total -gt $MaximumCount){throw 'Catalogue aggregate entry work bound exceeded'}
    return $total
}

Export-ModuleMember -Function Assert-CatalogPrivatePath,Write-CatalogAtomicJson,Read-CatalogCacheJson,New-CatalogRunStatus,Test-CatalogArchiveDeadline,Add-CatalogEntryWork
