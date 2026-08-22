param(
    [string]$SshHost = "losttale-mac",
    [string]$SimulatorName = "iPhone 17 Pro",
    [string]$RemoteRoot = "/tmp/dsh-native-ios-build"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($SshHost -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw "SshHost must be a safe SSH config alias or hostname."
}
if ($SimulatorName -notmatch '^[A-Za-z0-9][A-Za-z0-9 .()_-]*$') {
    throw "SimulatorName contains unsupported shell characters."
}
if ($RemoteRoot -notmatch '^/tmp/dsh-native-ios-[A-Za-z0-9._-]+$') {
    throw "RemoteRoot must be one directory matching /tmp/dsh-native-ios-*."
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$IosDirectory = Join-Path $RepositoryRoot "ios"

Write-Host "Preparing ${SshHost}:$RemoteRoot"
& ssh $SshHost "rm -rf '$RemoteRoot' && mkdir -p '$RemoteRoot'"
if ($LASTEXITCODE -ne 0) { throw "Could not prepare the remote build directory." }

Write-Host "Copying iOS sources"
& scp -r $IosDirectory "${SshHost}:$RemoteRoot/"
if ($LASTEXITCODE -ne 0) { throw "Could not copy the iOS project." }

$RemoteCommand = "cd '$RemoteRoot/ios' && chmod +x scripts/build.sh && SIMULATOR_NAME='$SimulatorName' DERIVED_DATA='$RemoteRoot/DerivedData' scripts/build.sh"

Write-Host "Building and testing on $SshHost"
& ssh $SshHost $RemoteCommand
if ($LASTEXITCODE -ne 0) { throw "The remote iOS build failed." }

Write-Host "iOS simulator tests and unsigned device compile passed."
