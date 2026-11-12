using System;
using System.IO;
using System.Security.Cryptography;

namespace RichAudio.GateA.Private03
{
    internal static class PrivateProfileContract
    {
        internal const string Profile = "ra_gapriv01_bati";
        internal const string Confirmation = "ASSIGN_PRIVATE_TO_A";
    }
    internal sealed class ResourcePin
    {
        internal readonly string RelativePath, Sha256;
        internal ResourcePin(string path, string sha256) { RelativePath = path; Sha256 = sha256; }
    }
    internal static class PrivateResourceAdmission
    {
        // Disk identity is an admission prerequisite only. It never claims that GTA mounted a resource.
        // Called only by the evidence worker before enabling any script game calls.
        internal static bool Verify(string root, ResourcePin[] pins)
        {
            try
            {
                if (pins == null || pins.Length == 0) return false;
                string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                var unique = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var pin in pins)
                {
                    if (pin == null || String.IsNullOrEmpty(pin.RelativePath) || Path.IsPathRooted(pin.RelativePath) ||
                        pin.RelativePath.Contains(":") || pin.Sha256 == null || pin.Sha256.Length != 64) return false;
                    string full = Path.GetFullPath(Path.Combine(prefix, pin.RelativePath));
                    if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !unique.Add(full) || !File.Exists(full)) return false;
                    for (var entry = new FileInfo(full).Directory; entry != null; entry = entry.Parent)
                        if ((entry.Attributes & FileAttributes.ReparsePoint) != 0) return false;
                    if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) return false;
                    using (var input = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read))
                    using (var sha = SHA256.Create())
                        if (!String.Equals(BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant(), pin.Sha256,
                            StringComparison.Ordinal)) return false;
                }
                return true;
            }
            catch (IOException) { return false; }
            catch (UnauthorizedAccessException) { return false; }
            catch (ArgumentException) { return false; }
            catch (NotSupportedException) { return false; }
        }
    }
}
