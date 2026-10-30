$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '..\src\acoustics\startup\InstalledCatalog.psm1') -Force
function Assert($Value,[string]$Message){if(!$Value){throw $Message}}
function Xml([string]$Value){Read-CatalogXml ([Text.Encoding]::UTF8.GetBytes($Value))}
$dlc=@(Get-CatalogDlcDeclarations (Xml '<SMandatoryPacksData><Paths><Item>dlcpacks:/newmap/</Item><Item>dlcpacks:/oldmap/</Item><Item>other:/unknown/</Item></Paths></SMandatoryPacksData>'))
Assert ($dlc.Count -eq 3 -and $dlc[0].Pack -eq 'newmap' -and $dlc[1].Index -eq 1) 'Actual declared order must survive'
Assert (!$dlc[2].SupportedPath) 'Unknown mount schemes must remain unsupported'
$declarations=@(Get-CatalogVehicleDeclarations (Xml '<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>newcar</modelName><audioNameHash>customengine</audioNameHash><vehicleClass>VC_SUPER</vehicleClass><type>VEHICLE_TYPE_CAR</type></Item><Item><modelName>newplane</modelName><audioNameHash/><type>VEHICLE_TYPE_PLANE</type></Item></InitDatas></CVehicleModelInfo__InitDataList>') 'synthetic/vehicles.meta')
Assert ($declarations.Count -eq 2 -and $declarations[0].AudioIdentifier -eq 'customengine') 'Arbitrary models and explicit audio aliases required'
Assert ($declarations[1].VehicleType -eq 'VEHICLE_TYPE_PLANE' -and $declarations[1].AudioSelectionBasis -match 'inferred') 'Non-car family and fallback uncertainty required'
$replacement=[pscustomobject]@{Model='NEWCAR';AudioIdentifier='otherengine';Source='synthetic/override.meta'}
$models=@(Get-CatalogModelSummary @($declarations+$replacement))
Assert (@($models|Where-Object ConflictingAudioDeclarations).Count -eq 1) 'Conflicting aliases must not select an invented winner'
Assert (@($models|Where-Object EffectiveRuntimeSelection -NE 'unresolved').Count -eq 0) 'All effective selections remain unresolved'
$manifest=@(Get-CatalogManifestDeclarations (Xml '<CDataFileMgr__ContentsOfDataFileXml><dataFiles><Item><filename>dlc_test:/data/custom.meta</filename><fileType>VEHICLE_METADATA_FILE</fileType><disabled value="true"/></Item></dataFiles></CDataFileMgr__ContentsOfDataFileXml>') 'synthetic/content.xml')
Assert ($manifest.Count -eq 1 -and $manifest[0].DisabledDeclaration -eq 'true' -and $manifest[0].RuntimeActivation -match 'unresolved') 'Manifest registration is not active runtime state'
$rejected=$false;try{Xml '<!DOCTYPE x [<!ENTITY unsafe SYSTEM "file:///missing">]><x>&unsafe;</x>'|Out-Null}catch{$rejected=$true}
Assert $rejected 'External entity / DTD input must reject'
foreach($bad in @('..\escape.rpf','C:\outside.rpf','update\..\escape.rpf')){$rejected=$false;try{Resolve-CatalogArchivePath 'C:\synthetic-game' $bad|Out-Null}catch{$rejected=$true};Assert $rejected 'Archive traversal must reject'}
Assert ((Get-CatalogByteHash ([Text.Encoding]::UTF8.GetBytes('abc'))) -eq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') 'Exact byte SHA-256 required'
$stamp=[ordered]@{Archive='synthetic/dlc.rpf';DeclaredDlcIndex=1;GameExecutable='old';Parser='v1'}
$fingerprint=Get-CatalogArchiveFingerprint $stamp
$stamp.DeclaredDlcIndex=2
Assert ((Get-CatalogArchiveFingerprint $stamp) -ne $fingerprint) 'Changed DLC order must invalidate archive cache'
$stamp.DeclaredDlcIndex=1;$stamp.GameExecutable='changed'
Assert ((Get-CatalogArchiveFingerprint $stamp) -ne $fingerprint) 'Changed game binding must invalidate archive cache'
Write-Output 'Installed acoustic catalogue helper checks passed (14 assertions); no game, vendor parser or audio endpoint used.'
