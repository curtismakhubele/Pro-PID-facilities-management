$appName = 'pidfm'
$kuduUrl = 'https://$appName.scm.azurewebsites.net'

# Settings to apply
$settings = @{
    'ADMIN_EMAIL' = '66978769@mylife.unisa.ac.za'
    'ADMIN_PASSWORD' = 'UnisaPID@2024'
    'SESSION_SECRET' = 'VeOmEAOZFtvf6KQRGuVTqWpOp1g1jNDZQ4m+ZkBeWoVh6DwIAKw4jj1XGXkNdiB5'
    'NODE_ENV' = 'production'
    'DATA_DIR' = '/home/pid-facilities-data'
    'WEBSITE_RUN_FROM_PACKAGE' = '1'
}

Write-Host "Settings to be applied:" -ForegroundColor Yellow
$settings | ForEach-Object {
    $_.GetEnumerator() | ForEach-Object {
        Write-Host "  $($_.Key) = $($_.Value)" -ForegroundColor Cyan
    }
}

Write-Host "
Note: Settings need to be applied via Azure Portal or using authenticated REST calls" -ForegroundColor Yellow
Write-Host "Please use the Azure Portal to manually add these app settings to your App Service." -ForegroundColor Yellow
