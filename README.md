
# AgriAdmin - Online Grocery Store Admin Panel

A comprehensive bilingual (English/French) admin control panel for an African online grocery store. Features inventory management, order processing, and AI-powered insights using Gemini.


## Setup & Installation

### 1. Prerequisites

- Node.js (v18 or higher)
- NPM or Yarn

### 2. Run Application

```bash
# Install dependencies
npm install

# Run Frontend
npm run dev
# Frontend runs on http://localhost:5173
```

## API Connection

This application is a standalone frontend designed to connect to a REST API.
By default, it proxies requests to `/api` to `http://localhost:3001` (configured in `vite.config.ts`).
Update the proxy target or the API_URL configuration to point to your actual backend service.



## Features

- **Dashboard**: Real-time sales stats and AI business insights.
- **Inventory**: Manage products, stock levels, and use AI to generate descriptions or edit images.
- **Orders**: Kanban or Calendar view for orders. Print invoices and manage delivery status.
- **Customers**: CRM with location tracking and order history.
- **Settings**: Manage categories, locations (cities/pickup points), users, and roles.

## Production Build

1. Build the frontend: `npm run build`
2. Serve the `dist` folder using any static file server (Nginx, Apache, Vercel, Netlify, etc.).
3. Ensure your server or API gateway handles the `/api` requests or configure the frontend to point to the correct API domain.
# AgriMarket-webapp-Console-test-private-repo
