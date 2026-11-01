# E-Commerce

## Requirements

- Node.js 20+
- MongoDB
- Redis
- Cloudinary account
- Stripe account for checkout

## Setup

1. Install dependencies:

   ```powershell
   npm install
   npm install --prefix frontend
   ```

2. Create a root `.env` file:

   ```text
   PORT=5000
   NODE_ENV=development
   MONGO_URI=<mongodb-connection-string>
   UPSTASH_REDIS_URL=<redis-connection-string>
   ACCESS_TOKEN_SECRET=<long-random-secret>
   REFRESH_TOKEN_SECRET=<long-random-secret>
   CLOUDINARY_CLOUD_NAME=<cloud-name>
   CLOUDINARY_API_KEY=<api-key>
   CLOUDINARY_API_SECRET=<api-secret>
   STRIPE_SECRET_KEY=<stripe-secret-key>
   CLIENT_URL=http://localhost:5173
   ```

3. Start the backend and frontend in separate terminals:

   ```powershell
   npm run dev
   npm run dev --prefix frontend
   ```

The frontend is available at `http://localhost:5173`.

## Useful checks

```powershell
npm run lint
npm run check:backend
npm run build
```

Products can be marked as featured from `/secret-dashboard`. Product images are uploaded to Cloudinary and are required when creating a product.

## Deploy to Render

This project is configured to deploy as one Render Web Service. In production, Express serves the Vite build from `frontend/dist`, and the frontend calls the API through the same origin.

Use these Render settings:

- **Runtime:** Node
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Health check path:** `/api/health`

Set these environment variables in Render:

```text
NODE_ENV=production
MONGO_URI=<mongodb-connection-string>
UPSTASH_REDIS_URL=<redis-connection-string>
ACCESS_TOKEN_SECRET=<long-random-secret>
REFRESH_TOKEN_SECRET=<long-random-secret>
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
STRIPE_SECRET_KEY=<stripe-secret-key>
CLIENT_URL=https://<your-render-service>.onrender.com
```

Do not commit `.env` or paste secret values into the repository. After deployment, verify signup, login, cart, admin product creation, Stripe test checkout, and the purchase-success flow.
