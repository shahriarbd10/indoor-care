# Indoor Care Scanner

Responsive Next.js app that identifies plants from a live camera feed.

## Features

- Mobile and desktop camera support
- Pl@ntNet as primary plant provider
- Plant.id fallback when confidence is low
- Clean API route with server-side key protection

## 1. Install

```bash
npm install
```

## 2. Configure env

Copy `.env.example` to `.env.local` and fill values:

```env
PLANTNET_API_KEY=your_plantnet_key
PLANT_ID_API_KEY=your_plantid_key_optional
PLANT_CONFIDENCE_THRESHOLD=0.65
```

## 3. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 4. Build check

```bash
npm run build
```

## How it works

- Camera frames are captured every ~1.8 seconds.
- Browser sends one compressed JPEG frame to `/api/plant-identify`.
- Server calls Pl@ntNet first.
- If confidence is below threshold, server tries Plant.id fallback.
- UI renders top match, confidence, and alternatives.

## Notes

- API keys never go to the browser.
- Camera access requires HTTPS outside localhost.
- Add rate limiting before production rollout.
