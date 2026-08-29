# PID Facilities Management — live application

This package replaces the browser-only demo with a server-backed application. It has password authentication, signed HTTP-only sessions, sign-in/sign-out, and one shared persistent datastore. No demo records or fallback browser storage are used.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`, then set the first administrator and a long session secret. The supplied package is already configured with the requested initial administrator.
3. Start the server (double-click `start-app.ps1`, or run the command below):

```powershell
npm start
```

4. Open `http://localhost:4310`, then sign in with that administrator account.

Do not open `index.html` directly. It needs the application server running to sign in and access the shared data.

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
