param([Parameter(Mandatory=$true)][string]$PathsFile,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Output){throw 'Fresh evidence output required'}
$paths=Get-Content -LiteralPath $PathsFile -Raw|ConvertFrom-Json
$rows=@(foreach($path in $paths){
 $before=Get-FileHash -LiteralPath $path -Algorithm SHA256
 $item=Get-Item -LiteralPath $path
 $signature=Get-AuthenticodeSignature -LiteralPath $path
 $chain=New-Object Security.Cryptography.X509Certificates.X509Chain
 $chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::Offline
 $chainOk=if($signature.SignerCertificate){$chain.Build($signature.SignerCertificate)}else{$false}
 $elements=@($chain.ChainElements|ForEach-Object{[ordered]@{subject=$_.Certificate.Subject;issuer=$_.Certificate.Issuer;thumbprint=$_.Certificate.Thumbprint;status=@($_.ChainElementStatus|ForEach-Object{$_.Status.ToString()})}})
 $links=@(& fsutil.exe hardlink list $path);$linkExit=$LASTEXITCODE
 $after=Get-FileHash -LiteralPath $path -Algorithm SHA256
 if($before.Hash-ne$after.Hash){throw 'File changed during signature inspection'}
 [ordered]@{path=$item.FullName;bytes=$item.Length;sha256=$before.Hash.ToLowerInvariant();fileVersion=$item.VersionInfo.FileVersion;productVersion=$item.VersionInfo.ProductVersion;lastWriteUtc=$item.LastWriteTimeUtc.ToString('o');creationUtc=$item.CreationTimeUtc.ToString('o');signature=[ordered]@{status=$signature.Status.ToString();message=$signature.StatusMessage;type=$signature.SignatureType.ToString();isOsBinary=$signature.IsOSBinary;subject=$signature.SignerCertificate.Subject;issuer=$signature.SignerCertificate.Issuer;thumbprint=$signature.SignerCertificate.Thumbprint;notBefore=$(if($signature.SignerCertificate){$signature.SignerCertificate.NotBefore.ToUniversalTime().ToString('o')}else{$null});notAfter=$(if($signature.SignerCertificate){$signature.SignerCertificate.NotAfter.ToUniversalTime().ToString('o')}else{$null});timestampSubject=$signature.TimeStamperCertificate.Subject;chainOfflineBuilt=$chainOk;chainStatus=@($chain.ChainStatus|ForEach-Object{$_.Status.ToString()});chain=$elements};hardlinksExit=$linkExit;hardlinks=$links}
 $chain.Dispose()
})
ConvertTo-Json -InputObject @($rows) -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8NoBOM
