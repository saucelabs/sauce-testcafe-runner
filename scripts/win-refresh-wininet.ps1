# adapted from https://gist.github.com/mikeperri/36e656f28e42aa9cee18ce88361f6c16
# refreshes wininet so it is aware of new registry changes

$signature = @'
[DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@

$INTERNET_OPTION_SETTINGS_CHANGED   = 39
$INTERNET_OPTION_REFRESH            = 37

$type = Add-Type -MemberDefinition $signature -Name wininet -Namespace pinvoke -PassThru
$a = $type::InternetSetOption(0, $INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
$b = $type::InternetSetOption(0, $INTERNET_OPTION_REFRESH, 0, 0)

$a -and $b
