# Vectrace Emb MVP

Vectrace Emb is a desktop-first internal CRM for embroidery, digitizing, vector-art, and DTF-printing workflows.

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend health: `http://localhost:3001/health`

Demo credentials:

- Admin: `ayesha@stitchcrm.com` / `Admin123!`
- Caller: `hamza@stitchcrm.com` / `Caller123!`
- Designer: `mariam@stitchcrm.com` / `Designer123!`

## Persistence seam

Business logic is in `backend/src/services/`, while persistence is behind the repository interfaces in `backend/src/repositories/interfaces.ts`. Replace the in-memory implementations in `backend/src/repositories/in-memory.ts` with Postgres implementations without changing routes or services.

## MVP decisions

- Email sending, file binaries, payment gateways, notifications, and global search remain deliberately deferred; assignment emails and attachments are metadata/simulation seams.
- Pipeline and project status enums remain fixed in code; custom admin-configured stages are deferred.
- Follow-up creation is implemented as a dated lead record; a persisted audit-event timeline remains deferred.
- The USD→PKR rate is currently the PRD default of 278 and is clearly labeled as manual, not live-updated.
