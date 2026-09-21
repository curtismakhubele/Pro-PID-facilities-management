# PID Facilities Management — live application

This package replaces the browser-only demo with a server-backed application. It has password authentication, signed HTTP-only sessions, sign-in/sign-out, and one shared persistent datastore. No demo records or fallback browser storage are used.

## Live application

Open the deployed application at:

https://pid-ftf6dmerh7fmfkga.southafricanorth-01.azurewebsites.net

Sign in with the administrator account configured for the Azure App Service. The browser client connects directly to the live application server; no localhost server is required.

The initial account is created only on the first startup. Its password is stored as a salted scrypt hash in `data/state.json`; keep that directory private and back it up securely.

## Create team accounts

With the same environment variables set, stop the server and run:

```powershell
node server.js create-user technician@company.co.za 'temporary-password' technician 'Technician Name'
```

Roles: `admin`, `hq`, `centre`, `technician`, and `intern`. Have the user sign in, then add their matching email under **Admin Platform** to manage their in-app directory record.

## Deploy safely

Deploy this folder to a Node.js host, set `NODE_ENV=production`, configure the environment variables in the host’s secret manager, terminate TLS/HTTPS at the host, and persist the `data` directory on durable private storage. Do not commit `.env` files or `data/state.json`.

For Azure App Service, use the included `pid-facilities-management-azure.zip` and follow [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md). It sets `DATA_DIR=/home/pid-facilities-data` so application records are not written into the deployment package.
