param([string]$ModulePath,[string]$PrivateRoot,[string]$Destination,[string]$ReceiptPath,[ValidateSet('write','read-invalid')][string]$Operation='write')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
Import-Module (New-Module -Name CataloguePublicationActualWriter01 -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($ModulePath)))) -Force
$parent=[IO.Path]::GetDirectoryName($Destination)
$before=[IO.Directory]::Exists($parent)
$script:observedPending=$null;$exception=$null;$result=$null;$published=$false
try {
 if($Operation-eq'read-invalid'){$result=Read-CatalogCacheJson -PrivateRoot $PrivateRoot -Path $Destination -ExpectedFingerprint 'expected'}
 else {$result=Write-CatalogAtomicJson -PrivateRoot $PrivateRoot -Path $Destination -Value ([ordered]@{Schema=1;Fingerprint='expected';Value='replacement'}) -BeforePublish {param($pending)$script:observedPending=[ordered]@{path=$pending;length=$pending.Length;exists=[IO.File]::Exists($pending);bytes=(Get-Item -LiteralPath $pending).Length}};$published=$true}
} catch {
 $inner=$_.Exception;while($inner.InnerException){$inner=$inner.InnerException}
 $exception=[ordered]@{type=$inner.GetType().FullName;message=$inner.Message;hresult=$inner.HResult;hresultHex=('0x{0:x8}'-f($inner.HResult-band0xffffffffL));win32Code=($inner.HResult-band65535);position=$_.InvocationInfo.PositionMessage;scriptStack=$_.ScriptStackTrace}
}
$hash=[Security.Cryptography.SHA256]::Create();$moduleStream=[IO.File]::OpenRead($ModulePath);try{$moduleHash=([BitConverter]::ToString($hash.ComputeHash($moduleStream))).Replace('-','').ToLowerInvariant()}finally{$moduleStream.Dispose();$hash.Dispose()}
$receipt=[ordered]@{schema=1;runtime=$PSVersionTable.PSVersion.ToString();edition=$PSVersionTable.PSEdition;framework=[Environment]::Version.ToString();workingDirectory=(Get-Location).Path;modulePath=$ModulePath;moduleSha256=$moduleHash;privateRoot=$PrivateRoot;destination=$Destination;destinationLength=$Destination.Length;parent=$parent;parentLength=$parent.Length;parentExistedBefore=$before;parentExistsAfter=[IO.Directory]::Exists($parent);insidePrivateRoot=$Destination.StartsWith($PrivateRoot+'\',[StringComparison]::OrdinalIgnoreCase);operation=$Operation;published=$published;beforePublish=$script:observedPending;exception=$exception;destinationExists=[IO.File]::Exists($Destination);destinationText=$(if([IO.File]::Exists($Destination)){[IO.File]::ReadAllText($Destination)}else{$null});fixtureOnly=$true;gameAccessed=$false}
[IO.File]::WriteAllText($ReceiptPath,($receipt|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
