using System;
using System.IO;
using System.Net;
using System.Security;

namespace RichAudio.Beacon.Windows
{
    // Constants only: never publish exception messages, filenames or JSON contents.
    public sealed class MenuDiagnostic
    {
        public readonly string Stage,Code,ExceptionType;
        private static string Safe(string value)
        {if(String.IsNullOrEmpty(value))return "unknown";if(value.Length>48)value=value.Substring(0,48);return System.Text.RegularExpressions.Regex.Replace(value,"[^A-Za-z0-9-]","_");}
        public MenuDiagnostic(string stage,string code,string exceptionType="none")
        {Stage=Safe(stage);Code=Safe(code);ExceptionType=Safe(exceptionType);}
        public string Summary {get{return "stage="+Stage+" code="+Code+" exception="+ExceptionType;}}
        public static MenuDiagnostic Failure(string stage,Exception e)
        {
            string kind=e is FileNotFoundException?"FileNotFoundException":e is DirectoryNotFoundException?"DirectoryNotFoundException":
                e is UnauthorizedAccessException?"UnauthorizedAccessException":e is SecurityException?"SecurityException":
                e is InvalidDataException?"InvalidDataException":e is FileLoadException?"FileLoadException":
                e is TypeLoadException?"TypeLoadException":e is BadImageFormatException?"BadImageFormatException":
                e is WebException?"WebException":e is IOException?"IOException":e is ArgumentException?"ArgumentException":"Exception";
            string code=e is FileNotFoundException||e is DirectoryNotFoundException?"file-missing":
                e is UnauthorizedAccessException||e is SecurityException?"access-denied":
                e is TypeLoadException||e is FileLoadException||e is BadImageFormatException?"dependency-load-failed":
                e is WebException?"service-disconnected":e is InvalidDataException||e is ArgumentException?"invalid-data-or-scope":
                e is IOException?"io-failed":"worker-failed";
            return new MenuDiagnostic(stage,code,kind);
        }
    }
}
