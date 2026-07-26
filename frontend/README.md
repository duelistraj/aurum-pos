# Frontend - Aurum POS

React + TypeScript frontend for Aurum POS with:

- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Fast Performance**: Optimized with Vite and React
- **Smooth Animations**: Subtle transitions and loading states
- **Type Safety**: Full TypeScript support
- **Modern UI**: Clean, professional design with Lucide icons

## Pages

1. **Dashboard** - Overview and quick access to main features
2. **POS** - Point of sale with barcode scanning
3. **Items** - Inventory management
4. **Metal Rates** - Update precious metal market prices
5. **Settings** - Application configuration

## Features

- ✅ Barcode scanning for quick sales
- ✅ Real-time price calculations based on metal rates
- ✅ Customer details management
- ✅ Invoice generation and PDF download
- ✅ Inventory management with search
- ✅ Metal rate management with quick reference
- ✅ Responsive navigation
- ✅ Loading states and error handling
- ✅ Smooth animations
- ✅ API integration with axios
- ✅ Environment configuration support

## Getting Started

### Installation

```bash
cp .env.example .env.local
npm ci
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5174`. Development uses this
port strictly and will fail if it is unavailable.

### Build

```bash
npm run build
```

### Environment Variables

For local development and self-hosted builds, `VITE_API_URL` must point to the backend.
Backend URLs are immutable build inputs and cannot be changed from inside the application.

```env
VITE_API_URL=http://localhost:8080
VITE_DISTRIBUTION=self_hosted
VITE_GOOGLE_AUTH_ENABLED=false
```

Cloud builds ignore `VITE_API_URL` and always use `https://api.aurumpos.net`.
The cloud debug APK intentionally keeps `VITE_GOOGLE_AUTH_ENABLED=false`.
Signed Play test and release builds set it to `true` and obtain the public Google Web client ID from the backend auth-provider endpoint.

## Project Structure

```
src/
├── api/          # API client and endpoints
├── components/   # Reusable UI components
├── pages/        # Page components
├── types/        # TypeScript type definitions
├── utils.ts      # Utility functions
├── App.tsx       # Main app component
├── main.tsx      # Entry point
└── index.css     # Global styles and Tailwind
```

## API Integration

The frontend integrates with the following backend endpoints:

### Health Check
- `GET /` - Check API health

### Items
- `GET /items/` - List all items
- `GET /items/{id}` - Get item by ID
- `GET /items/barcode/{barcode}` - Get item by barcode
- `GET /items/pos/scan/{barcode}` - Get item with pricing for POS
- `POST /items/` - Create new item
- `GET /items/{id}/label` - Download item label PDF

### Metal Rates
- `POST /metal-rates/` - Add/update metal rate

### Sales
- `POST /sales/` - Create new sale
- `GET /sales/{id}/invoice` - Download invoice PDF

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance Optimizations

- Code splitting via React Router
- Lazy loading of routes
- Cached server state and request deduplication with TanStack Query
- Versioned, failure-tolerant local configuration storage

## License

AGPL-3.0-only
