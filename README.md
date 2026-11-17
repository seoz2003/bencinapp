# Bencinapp

Web para encontrar la bencina más barata en Chile. Muestra en un mapa los precios de todas las estaciones
informadas a la CNE y calcula el precio final según los descuentos de **tus** tarjetas y apps para el día
en que vas a cargar.

## Funcionalidades

- **Mapa a pantalla completa** (Leaflet + OpenStreetMap) con el precio de cada estación. Verde las más baratas de la zona, rojo las más caras, gris las que no actualizan su precio hace más de 21 días.
- **Precio final con descuentos**: eliges tus tarjetas (Banco de Chile, Santander, App Muevo, Shell Box, etc.), el día y los litros, y la app aplica el mejor descuento disponible en cada estación, respetando topes de litros y de monto.
- **Ubicación del usuario**, distancia a cada estación y enlace "Cómo llegar".
- **Descuentos verificados y de la comunidad**: el equipo carga los convenios desde el panel de administración y los usuarios pueden aportar nuevos y votarlos. Los que acumulan 3 votos netos negativos se ocultan solos.
- **Reportes de precio** de los usuarios, que se comparan con el precio publicado.
- **Panel de administración** (`/admin`) para crear, verificar u ocultar descuentos, agregar tarjetas, revisar reportes y forzar una sincronización.
- **Historial de precios** por estación (se guarda cada cambio detectado).

## Arquitectura

```
bencinapp/
├── backend/          API REST en Node 22 + Express 5 + TypeScript, base de datos SQLite (node:sqlite)
│   ├── src/providers  Fuentes de precios: API oficial CNE, API pública de bencinaenlinea.cl y snapshot semilla
│   ├── src/routes     Endpoints públicos y de administración
│   ├── data/seed      Snapshot real de precios para partir sin conexión
│   └── test           Pruebas (node:test)
├── frontend/         Vue 3 + Vite + TypeScript + Leaflet
└── Dockerfile        Imagen única: el backend sirve también el frontend compilado
```

El backend sincroniza los precios cada `SYNC_INTERVAL_MINUTES` minutos y los guarda en SQLite. El frontend
nunca habla directamente con la CNE, así las credenciales quedan solo en el servidor.

### Fuentes de precios

`PRICE_PROVIDER=auto` (por defecto) prueba en este orden:

1. **API oficial de la CNE** (`api.cne.cl`), si configuras `CNE_EMAIL` y `CNE_PASSWORD`. Hace login en `POST /api/login` y consulta `GET /api/v4/estaciones` con el token, que se renueva solo antes de vencer.
2. **API pública de bencinaenlinea.cl**, la misma que usa el sitio oficial. No pide token, pero no está documentada, así que conviene no consultarla más de una vez por hora.
3. **Snapshot semilla** (`backend/data/seed/snapshot.csv`, 1.805 estaciones del 17-11-2026). Solo se usa si la base está vacía y las dos anteriores fallan.

## Requisitos

- Node.js **22.13 o superior** (usa el módulo nativo `node:sqlite`, sin dependencias nativas que compilar).

## Desarrollo local

```bash
npm install
cp backend/.env.example backend/.env   # edita ADMIN_TOKEN y, si tienes, CNE_EMAIL / CNE_PASSWORD
npm run dev
```

- Frontend: http://localhost:5173 (Vite redirige `/api` al backend)
- API: http://localhost:3000/api/health

La primera vez el backend crea `backend/data/bencinapp.db`, carga tarjetas y descuentos de ejemplo y sincroniza precios.

### Obtener credenciales de la CNE

1. Regístrate gratis en https://api.cne.cl/register.
2. Pon tu correo y contraseña en `CNE_EMAIL` y `CNE_PASSWORD` dentro de `backend/.env`.
3. Fuerza una sincronización con `npm run sync` o desde `/admin`.

## Variables de entorno (backend)

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP |
| `DATABASE_PATH` | `./data/bencinapp.db` | Archivo SQLite |
| `PRICE_PROVIDER` | `auto` | `auto`, `cne`, `bencinaenlinea` o `snapshot` |
| `CNE_EMAIL` / `CNE_PASSWORD` | | Credenciales de api.cne.cl |
| `SYNC_INTERVAL_MINUTES` | `60` | Frecuencia de sincronización (0 la desactiva) |
| `ADMIN_TOKEN` | | Token del panel `/admin` (mínimo 16 caracteres) |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos en desarrollo |

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/health` | Estado y última sincronización |
| GET | `/api/meta` | Combustibles, tarjetas, marcas y total de estaciones |
| GET | `/api/stations?fuel=93&bbox=oeste,sur,este,norte` | Estaciones con precio para un combustible, ordenadas por precio |
| GET | `/api/stations/:id` | Detalle con todos los precios e historial de 90 días |
| GET | `/api/comunas?q=` | Comunas con su centro para buscar en el mapa |
| GET | `/api/discounts` | Descuentos visibles (encabezado `X-Voter-Id` para saber tu voto) |
| POST | `/api/discounts` | Aportar un descuento (comunidad) |
| POST | `/api/discounts/:id/vote` | Votar `{ "value": 1 \| -1 \| 0 }` |
| POST | `/api/price-reports` | Reportar un precio visto en la estación |
| * | `/api/admin/...` | Administración, con `Authorization: Bearer ADMIN_TOKEN` |

Los endpoints de escritura públicos tienen límite de 30 solicitudes cada 15 minutos por IP.

## Pruebas y build

```bash
npm test         # backend (node:test) y frontend (vitest)
npm run build    # compila backend a backend/dist y frontend a frontend/dist
npm start        # sirve API y frontend compilado en http://localhost:3000
```

## Despliegue

Con Docker:

```bash
docker compose up -d --build
```

La base queda en el volumen `bencinapp-data`. Sirve en cualquier servicio que soporte contenedores con disco
persistente (Railway, Fly.io, Render con disco, un VPS). Configura las variables de entorno en el servicio.

## Descuentos de ejemplo

La base parte con algunos descuentos marcados como **Ejemplo** para que la interfaz no se vea vacía. No son
convenios reales vigentes: reemplázalos desde `/admin` con los descuentos actuales de cada banco y app
(o marca "Es real" si verificaste uno).

## Próximos pasos

- Historial de precios en gráfico por estación.
- Notificaciones cuando baje el precio cerca del usuario.
- Pasar a PostgreSQL si el tráfico crece (las consultas son SQL estándar).
- Revisión automática mensual de convenios bancarios.

## Créditos

- Precios: Comisión Nacional de Energía, plataforma Bencina en Línea. Los precios son de responsabilidad de cada estación.
- Snapshot semilla: [diland9/precios-combustibles-chile](https://github.com/diland9/precios-combustibles-chile) (MIT).
- Mapas: © colaboradores de OpenStreetMap.
