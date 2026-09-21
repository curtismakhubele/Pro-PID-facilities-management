# Azure deployment

`pid-facilities-management-azure.zip` is ready for Azure App Service Windows F1 Free. It deliberately excludes `.env` and `data/`, so no local password or records are uploaded.

## Deploy

1. Install the Azure CLI and sign in to an Azure subscription.
2. In PowerShell, run:

```powershell
cd C:\Users\makhuc\Documents\Codex\2026-08-29\c\outputs\pid-facilities-management
.\azure-deploy.ps1 -SubscriptionId '<your-subscription-id>' -ResourceGroup 'rg-pid-fms' -AppName 'pid-fms-unique-name'
```

3. Enter the administrator password when prompted. The script creates a Windows F1 Free App Service plan, configures HTTPS, stores secrets as App Service settings, deploys the ZIP, and prints the live URL.

The server saves data under `D:\home\pid-facilities-data`, outside the read-only ZIP package. Keep the plan at one instance: the included JSON datastore is suitable for a small team, not multi-instance scaling. For a larger deployment, migrate storage to Azure Database for PostgreSQL or Cosmos DB before scaling out.

The package is intended for ZIP deployment through `az webapp deploy`; Azure App Service deploys ZIP contents to `/home/site/wwwroot`, while run-from-package mounts code read-only. [Microsoft’s ZIP deployment guidance](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip?tabs=cli&view=vs-2022) and [run-from-package guidance](https://learn.microsoft.com/en-us/azure/app-service/deploy-run-package) cover this flow.
