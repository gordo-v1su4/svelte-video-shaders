# Kill process on port 5173 (Windows PowerShell)
$port = 5173
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    $connections | ForEach-Object {
        $processId = $_.OwningProcess
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Killing process $processId ($($process.ProcessName)) on port $port"
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Port $port is now free"
} else {
    Write-Host "Port $port is already free"
}

