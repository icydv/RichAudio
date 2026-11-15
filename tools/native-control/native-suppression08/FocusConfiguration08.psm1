Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Get-FocusHash08([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Assert-FocusPath08([string]$Path){
 if(![IO.Path]::IsPathFullyQualified($Path)){throw 'Absolute settings path required'}
 for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Redirected filesystem link requires separate review'}
 }
}
function Read-FocusBytes08([byte[]]$Bytes){
 # Parse for structure; replace only the existing ASCII digit in the original
 # UTF-8 bytes. XML reserialization would change unrelated whitespace/encoding.
 $utf=[Text.UTF8Encoding]::new($false,$true);$text=$utf.GetString($Bytes).TrimStart([char]0xfeff)
 if($text-match'<!DOCTYPE|<!ENTITY'){throw 'DTD/entity settings refused'}
 $xml=[xml]$text;$nodes=@($xml.SelectNodes('/Settings/video/PauseOnFocusLoss'))
 if($nodes.Count-ne1-or@($xml.SelectNodes('//PauseOnFocusLoss')).Count-ne1){throw 'One existing video PauseOnFocusLoss required'}
 $node=$nodes[0];if($node.Attributes.Count-ne1-or$node.GetAttribute('value')-cnotmatch'^[01]$'-or$node.ChildNodes.Count){throw 'Malformed pause setting'}
 if($text-match'<\?xml[^?]*encoding\s*=\s*["''](?!UTF-8["''])'){throw 'Reviewed UTF-8 settings required'}
 $pattern='<PauseOnFocusLoss\s+value\s*=\s*(["''])([01])\1\s*/>'
 $matches=[regex]::Matches($text,$pattern);if($matches.Count-ne1){throw 'Unambiguous existing setting representation required'}
 $match=$matches[0];$bom=if($Bytes.Length-ge3-and$Bytes[0]-eq239-and$Bytes[1]-eq187-and$Bytes[2]-eq191){3}else{0}
 $offset=$bom+$utf.GetByteCount($text.Substring(0,$match.Groups[2].Index))
 $planned=[byte[]]$Bytes.Clone();$planned[$offset]=[byte][char]'0'
 [pscustomobject]@{value=[int]$node.GetAttribute('value');changed=($node.GetAttribute('value')-ceq'1');bytes=$planned;offset=$offset;encoding='UTF-8; original BOM and all other bytes preserved'}
}
function Resolve-FocusConfiguration08([string]$Documents,[string]$ExpectedProfile){
 Assert-FocusPath08 $Documents
 $root=Join-Path $Documents 'Rockstar Games\GTAV Enhanced';Assert-FocusPath08 $root
 $path=Join-Path $root 'settings.xml';Assert-FocusPath08 $path
 $copies=@(Get-ChildItem -LiteralPath $root -File -Force|Where-Object Name -Match '^settings.*\.xml$')
 if($copies.Count-ne1-or$copies[0].Name-cne'settings.xml'){throw 'Conflicting settings XML copies require review'}
 $profiles=@(Get-ChildItem -LiteralPath (Join-Path $root 'Profiles') -Directory -Force)
 if($profiles.Count-ne1-or$profiles[0].Name-cnotmatch'^[0-9A-Fa-f]{8}$'-or($ExpectedProfile-and$profiles[0].Name-cne$ExpectedProfile)){throw 'One exact reviewed Enhanced profile required'}
 foreach($name in 'cfg.dat','pc_settings.bin'){Assert-FocusPath08 (Join-Path $profiles[0].FullName $name);if(!(Test-Path -LiteralPath (Join-Path $profiles[0].FullName $name) -PathType Leaf)){throw 'Incomplete Enhanced profile'}}
 $parsed=Read-FocusBytes08 ([IO.File]::ReadAllBytes($path))
 [pscustomobject]@{documents=[IO.Path]::GetFullPath($Documents);root=$root;path=$path;profile=$profiles[0].Name;value=$parsed.value;changeNeeded=$parsed.changed;sha256=(Get-FocusHash08 $path);bytes=(Get-Item -LiteralPath $path).Length;encoding=$parsed.encoding}
}
function Get-CurrentFocusConfiguration08([string]$ExpectedProfile){
 $documents=[Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
 $personal=[Environment]::ExpandEnvironmentVariables((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders').Personal)
 if(![string]::Equals([IO.Path]::GetFullPath($personal),[IO.Path]::GetFullPath($documents),[StringComparison]::OrdinalIgnoreCase)){throw 'Known Documents and registry redirection disagree'}
 Resolve-FocusConfiguration08 $documents $ExpectedProfile
}
function Set-TemporaryFocus08($Plan,[string]$ReceiptPath){
 Assert-FocusPath08 $Plan.path;Assert-FocusPath08 $ReceiptPath
 if(Get-Process GTA5_Enhanced,PlayGTAV -ErrorAction SilentlyContinue){throw 'Never write settings while GTA is running'}
 # Exclusive handle rejects concurrent writers; compare the actual original
 # bytes before the single-digit write. A no-op never opens for write.
 if((Get-FocusHash08 $Plan.path)-cne$Plan.originalSha256){throw 'Original configuration changed'}
 $parsed=Read-FocusBytes08 ([IO.File]::ReadAllBytes($Plan.path))
 if($parsed.value-ne$Plan.originalValue-or$parsed.changed-ne$Plan.changeNeeded){throw 'Scope configuration intent differs'}
 $h=[Security.Cryptography.SHA256]::Create();try{$expected=[Convert]::ToHexString($h.ComputeHash($parsed.bytes)).ToLowerInvariant()}finally{$h.Dispose()}
 if($expected-cne$Plan.preparedSha256){throw 'Invalid prepared configuration identity; no write'}
 if($parsed.changed){
  $f=[IO.File]::Open($Plan.path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try{$bytes=[byte[]]::new($f.Length);if($f.Read($bytes,0,$bytes.Length)-ne$bytes.Length){throw 'Incomplete configuration read'}
   $h=[Security.Cryptography.SHA256]::Create();try{$hash=[Convert]::ToHexString($h.ComputeHash($bytes)).ToLowerInvariant()}finally{$h.Dispose()}
   if($hash-cne$Plan.originalSha256){throw 'Concurrent configuration edit'}
   $f.Position=$parsed.offset;$f.WriteByte([byte][char]'0');$f.Flush($true)
  }finally{$f.Dispose()}
 }
 $after=Get-FocusHash08 $Plan.path;if($after-cne$Plan.preparedSha256-or(Read-FocusBytes08 ([IO.File]::ReadAllBytes($Plan.path))).value-ne0){throw 'Prepared configuration differs'}
 $r=[ordered]@{schema='NativeSuppression08ConfiguredFocus';path=$Plan.path;originalSha256=$Plan.originalSha256;preparedSha256=$after;changed=$parsed.changed;value=0;utc=[DateTime]::UtcNow.ToString('o');runtimeBehaviourProven=$false}
 if(Test-Path -LiteralPath $ReceiptPath){throw 'Configuration receipt exists'}
 [IO.File]::WriteAllText($ReceiptPath,($r|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
Export-ModuleMember -Function Get-FocusHash08,Assert-FocusPath08,Read-FocusBytes08,Resolve-FocusConfiguration08,Get-CurrentFocusConfiguration08,Set-TemporaryFocus08
