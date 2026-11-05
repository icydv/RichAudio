# RichAudio-owned orchestration of public vendor APIs. This runs only inside an
# independently supervised decoder after installation read access is authorised.
# It never emits a key/bootstrap value or writes to the installation.
function Initialize-InstalledCodeWalker01 {
 [CmdletBinding()]
 param([Parameter(Mandatory=$true)][string]$GameRoot)
 $initRoot=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
 $initExe=Join-Path $initRoot 'GTA5_Enhanced.exe'
 for($initAt=$initExe;$initAt;$initAt=[IO.Path]::GetDirectoryName($initAt)){if((Get-Item -LiteralPath $initAt -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked Enhanced initializer input refused'}}
 $initInfo=Get-Item -LiteralPath $initExe -Force
 if($initInfo.PSIsContainer -or $initInfo.Length -lt 1MB -or $initInfo.Length -gt 512MB){throw 'Bounded Enhanced executable required for supported initializer'}
 $initType=[CodeWalker.GameFiles.GTA5Keys]
 $initLoads=@($initType.GetMethods([Reflection.BindingFlags]'Public,Static')|Where-Object Name -EQ 'LoadFromPath')
 $initThree=@($initLoads|Where-Object{$_.GetParameters().Count -eq 3 -and $_.GetParameters()[1].ParameterType -eq [bool]})
 if($initThree.Count -eq 1){
  [void]$initThree[0].Invoke($null,@($initRoot,$true,$null))
  return [pscustomobject]@{Route='public-Enhanced-LoadFromPath';EnhancedSelector=$true;SecretValuesPersisted=$false;GameWrites=$false}
 }
 $initTwo=@($initLoads|Where-Object{$_.GetParameters().Count -eq 2 -and $_.GetParameters()[1].ParameterType -eq [string]})
 $initGenerate=$initType.GetMethod('GenerateV2',[Reflection.BindingFlags]'Public,Static')
 if($initTwo.Count -ne 1 -or !$initGenerate){throw 'Supported public Enhanced initialization route unavailable'}
 # Older unmodified Core hardcodes gta5.exe in its directory overload. Its public
 # explicit-memory GenerateV2 plus optional-key overload avoids that filename
 # without a renamed executable, copied upstream code or private reflection.
 $initBytes=[IO.File]::ReadAllBytes($initExe);$initKey=$null
 try {
  [void]$initGenerate.Invoke($null,@($initBytes,$null))
  if([CodeWalker.GameFiles.GTA5Keys]::PC_AES_KEY.Length -ne 32){throw 'Supported initializer did not establish required state'}
  $initKey=[Convert]::ToBase64String([CodeWalker.GameFiles.GTA5Keys]::PC_AES_KEY)
  [void]$initTwo[0].Invoke($null,@($initRoot,$initKey))
 } finally {[Array]::Clear($initBytes,0,$initBytes.Length);$initBytes=$null;$initKey=$null}
 return [pscustomobject]@{Route='public-GenerateV2-explicit-Enhanced-memory-and-LoadFromPath';EnhancedSelector=$false;SecretValuesPersisted=$false;GameWrites=$false}
}
Export-ModuleMember -Function Initialize-InstalledCodeWalker01
