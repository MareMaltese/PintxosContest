# Pincho Party — diseño

**Fecha:** 2026-09-16
**Estado:** aprobado por el usuario, pendiente de plan de implementación

## 1. Propósito

Aplicación web para gestionar un concurso informal de pinchos/tapas durante una
fiesta privada en una red doméstica. Los invitados acceden desde el móvil vía
la IP local del ordenador que hace de servidor (`http://192.168.x.x:PUERTO`),
sin instalar nada ni crear cuenta con email/contraseña. El nombre de la app se
centraliza en una constante (`APP_NAME = "Pincho Party"`) para poder
renombrarla sin buscar-y-reemplazar en el código.

## 2. Alcance

**Incluye:** registro de participante por nombre, alta de tapas con foto desde
la cámara del móvil, fase de votación con "favoritos" (máx. 3), fase de
desempate acotada al podio, pantalla de resultados con reveal controlado por
el admin, panel de administración con PIN, datos de prueba para desarrollo.

**No incluye (fuera de alcance deliberado):** cuentas de usuario reales,
autenticación empresarial, despliegue fuera de LAN, miniaturas de imagen
independientes del tamaño optimizado, presencia en tiempo real exacta
(se usa heartbeat + polling), empates fuera del podio (se muestran tal cual en
el ranking).

## 3. Flujos de pantalla (mínimo)

1. Landing / bienvenida → "Participar"
2. Registro de usuario (solo nombre)
3. "¿Has traído algún pincho?" (Sí / No, solo vengo a comer)
4. Registrar pincho (foto + descripción opcional + nombre opcional)
5. Confirmación con número asignado ("¡Tu pincho está dentro! Nº 07")
6. Sala de espera (antes de que arranque la votación)
7. Galería de tapas (grid)
8. Detalle de tapa (foto grande, descripción, autor, botón de voto)
9. Indicador de favoritos "X / 3" (se adapta si hay menos tapas votables)
10. Pantalla de desempate (solo tapas empatadas)
11. Resultados / podio (con reveal controlado por admin)
12. Ranking completo
13. Login admin por PIN
14. Dashboard admin
15. Gestión de participantes
16. Gestión de tapas
17. Control de fases del concurso

## 4. Arquitectura

**Un repo, dos paquetes** (`server/`, `frontend/`), sin workspaces —
innecesario a este tamaño. Un `package.json` raíz solo con scripts de
conveniencia (`concurrently` para `npm run dev` levantando ambos a la vez).

**Servido único en producción:** el backend Express sirve el build estático
de Vite (`frontend/dist`) además de la API y `/uploads`. Así toda la fiesta
usa una sola URL/puerto (`http://192.168.x.x:3000`). El frontend llama
siempre a rutas **relativas** (`/api/...`, `/uploads/...`), nunca
`localhost` hardcodeado — la misma build funciona sea cual sea la IP desde la
que se acceda. En desarrollo, Vite hace proxy de `/api` y `/uploads` al
puerto del backend, manteniendo HMR.

El servidor Express escucha en `0.0.0.0`, nunca solo `localhost`.

**Tiempo real — SSE, no Socket.IO.** Un único endpoint
`GET /api/contest/stream` mantiene conexiones abiertas y difunde eventos:
cambio de fase, apertura/cierre de ronda de desempate, "resultados
revelados". `EventSource` nativo en el cliente, reconexión automática
incluida, cero dependencias nuevas. Justificación: solo necesitamos push
unidireccional servidor→cliente; Socket.IO añadiría dependencia y
complejidad (canal propio, librería cliente) sin necesidad real.

**Presencia — heartbeat simple, no realtime de verdad.** El cliente hace
`POST /api/users/:id/heartbeat` cada ~20s mientras la pestaña está activa.
El dashboard admin hace polling cada ~5-10s a `/api/admin/dashboard` y deriva
"online" si `lastSeen` < 30s.

**Backend:** Node.js + Express + TypeScript.

- `better-sqlite3`: API síncrona, transacciones triviales con
  `db.transaction()`, de sobra rápido para decenas de usuarios concurrentes en
  LAN. Se prefiere sobre el driver `sqlite3` async porque evita
  callback/promise overhead sin ninguna ventaja real a esta escala, y hace
  las transacciones de integridad (voto, alta de tapa con número
  correlativo) mucho más simples de razonar.
- `sharp`: reorientación EXIF, redimensionado y compresión de fotos.
- `multer` (memoria) → procesado con `sharp` → escritura a disco. Nunca se
  escribe el archivo original sin procesar.
- `zod`: validación de payloads de entrada en cada ruta.

**Frontend:** Vue 3 + `<script setup>` + TypeScript + Vite + Vue Router +
Pinia + `lucide-vue-next` para iconos (nunca emoji como icono de interfaz;
emoji solo permitido como acento tipográfico puntual en textos, no como
control de UI).

**Sin Tailwind.** CSS plano con custom properties como design tokens
(`styles/tokens.css`: color, espaciado, radios, sombras, tipografía). Da más
control sobre la estética minimalista pedida y evita una dependencia de build
adicional.

**Admin sin sesiones.** El PIN se introduce una vez en el dispositivo admin y
se guarda en `localStorage`; cada petición admin envía el header
`X-Admin-Pin`, comparado en el servidor contra `process.env.ADMIN_PIN` con
comparación de tiempo constante. Sin JWT ni almacenamiento de sesión en
servidor — sobrevive reinicios del servidor, y es proporcional al contexto
(fiesta privada, red doméstica de confianza).

## 5. Modelo de datos (SQLite)

```sql
Contest (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- fila única
  phase TEXT NOT NULL CHECK (phase IN ('REGISTRATION','VOTING','TIEBREAK','RESULTS')),
  allowSelfVote INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
  resultsRevealedAt TEXT NULL,              -- ISO datetime, null = calculado pero no mostrado
  createdAt TEXT NOT NULL
)

User (
  id TEXT PRIMARY KEY,       -- uuid
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  lastSeen TEXT NOT NULL
)

Entry (
  id TEXT PRIMARY KEY,       -- uuid interno, no predecible
  number INTEGER NOT NULL UNIQUE,  -- correlativo público #01, #02...
  creatorId TEXT NOT NULL REFERENCES User(id),
  name TEXT NULL,
  description TEXT NULL,
  imagePath TEXT NOT NULL,   -- ruta relativa bajo uploads/
  createdAt TEXT NOT NULL
)

Vote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId)
)

TiebreakRound (
  id TEXT PRIMARY KEY,
  roundNumber INTEGER NOT NULL,   -- correlativo global
  targetRank INTEGER NOT NULL,    -- 1, 2 o 3: qué puesto del podio resuelve
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  createdAt TEXT NOT NULL,
  closedAt TEXT NULL
)

TiebreakCandidate (
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  PRIMARY KEY (roundId, entryId)
)

TiebreakVote (
  id TEXT PRIMARY KEY,
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (roundId, userId)
)
```

Los números de tapa se asignan dentro de una transacción
(`SELECT MAX(number)+1 ... INSERT`) para que dos altas simultáneas nunca
choquen.

## 6. Máquina de estados del concurso

```
REGISTRATION
  --[admin: iniciar concurso]--> VOTING

VOTING
  --[admin: cerrar votación]--> calcula ranking completo
    → podio (1º-3º) sin empates → RESULTS (resultsRevealedAt = NULL)
    → empate que afecta al podio → TIEBREAK (nueva ronda, targetRank = N)

TIEBREAK (ronda abierta para targetRank = N)
  --[admin: cerrar ronda]--> recalcula esa franja
    → sigue empatada → nueva ronda, mismo targetRank
    → resuelta y quedan otros puestos de podio empatados → nueva ronda, targetRank = siguiente
    → podio totalmente resuelto → RESULTS (resultsRevealedAt = NULL)

RESULTS (resultsRevealedAt = NULL)
  --[admin: mostrar resultados]--> resultsRevealedAt = now(), evento SSE
```

Empates fuera del podio (4º puesto en adelante) no generan ronda: se
muestran empatados tal cual en el ranking completo.

`resultsRevealedAt` existe para separar "ranking ya calculado" de "ranking ya
enseñado": permite al admin controlar el momento dramático de "Mostrar
resultados" aunque el cálculo ya esté listo antes.

## 7. Reglas de negocio críticas (se validan SIEMPRE en backend)

- Máximo 3 favoritos por usuario, adaptado a
  `min(3, tapas_votables_para_ese_usuario)`, donde tapas votables excluye las
  propias si `allowSelfVote = false`. Evita que alguien nunca pueda llegar a
  "completo" por construcción.
- No se puede votar dos veces la misma tapa (constraint `UNIQUE`).
- No se puede votar fuera de fase `VOTING` (favoritos) o `TIEBREAK` (voto de
  desempate).
- No se puede dar de alta una tapa fuera de fase `REGISTRATION`.
- Autovoto bloqueado si `Contest.allowSelfVote = false`.
- El número de tapa es inmutable una vez asignado; nunca se expone forma de
  modificarlo, ni siquiera desde admin.
- No se puede votar una tapa/candidato que no existe.
- No se puede votar en desempate fuera de una ronda `OPEN`, ni más de una vez
  por ronda (constraint `UNIQUE`), ni por una tapa que no sea candidata de esa
  ronda.
- Todas las operaciones de conteo y verificación (nº de favoritos actuales,
  asignación de número) ocurren dentro de una transacción SQLite para evitar
  condiciones de carrera con peticiones casi simultáneas.
- **Privacidad durante VOTING/TIEBREAK:** ningún endpoint público ni de admin
  expone recuentos de votos mientras la fase sea `VOTING` o `TIEBREAK`. Los
  recuentos solo se calculan/exponen a partir de `RESULTS`. El admin puede ver
  *quién ha votado* (progreso `X/3`) pero no *a quién*.

## 8. API (prefijo `/api`)

Autenticación de usuario: header `X-User-Id` (uuid emitido por
`POST /users`), validado contra la tabla `User` en middleware. Autenticación
admin: header `X-Admin-Pin`.

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| POST | `/users` | — | `{ name }` → crea usuario, devuelve `{ id, name }` |
| POST | `/users/:id/heartbeat` | usuario propio | actualiza `lastSeen` |
| GET | `/contest` | — | `{ phase, allowSelfVote }` (campos públicos únicamente) |
| GET | `/contest/stream` | — | SSE: `phase-changed`, `tiebreak-round-changed`, `results-revealed` |
| POST | `/entries` | usuario | multipart (`image`, `name?`, `description?`); solo en `REGISTRATION` |
| GET | `/entries` | usuario | bloqueado en `REGISTRATION` (preserva el efecto reveal de la galería) |
| GET | `/entries/:id` | usuario | igual restricción de fase |
| GET | `/votes/me` | usuario | mis favoritos actuales + límite adaptado |
| POST | `/votes` | usuario | `{ entryId }`; solo en `VOTING` |
| DELETE | `/votes/:entryId` | usuario | solo en `VOTING` |
| GET | `/tiebreak/current` | usuario | ronda abierta + candidatos (sin conteos) |
| POST | `/tiebreak/vote` | usuario | `{ entryId }`; solo en `TIEBREAK`, ronda `OPEN` |
| GET | `/results` | usuario | solo si `phase = RESULTS` y `resultsRevealedAt` no es null |
| GET | `/admin/dashboard` | admin | fase, contadores, progreso de voto por persona, `lastSeen` |
| POST | `/admin/contest/start` | admin | `REGISTRATION → VOTING` |
| POST | `/admin/contest/close-voting` | admin | `{ force?: boolean }`; calcula ranking, abre `TIEBREAK` o dispone `RESULTS` |
| POST | `/admin/tiebreak/close-round` | admin | tally de la ronda abierta, decide siguiente paso |
| POST | `/admin/contest/reveal-results` | admin | fija `resultsRevealedAt`, dispara SSE |
| PATCH | `/admin/entries/:id` | admin | editar `name`/`description` |
| DELETE | `/admin/entries/:id` | admin | cascada: votos y candidaturas de desempate referenciando la tapa |
| PATCH | `/admin/users/:id` | admin | corregir `name` |
| DELETE | `/admin/users/:id` | admin | cascada: sus tapas (+ ficheros), sus votos emitidos y recibidos |
| PATCH | `/admin/contest` | admin | `{ allowSelfVote }` |

Las imágenes se sirven como estáticos desde `/uploads/:filename`, con nombre
de fichero aleatorio (uuid), nunca el nombre original del cliente — evita
path traversal y nombres predecibles.

## 9. Rutas de frontend

`/`, `/registro`, `/pincho/nuevo`, `/pincho/confirmacion/:number`,
`/esperando`, `/galeria`, `/pincho/:id`, `/desempate`, `/resultados`,
`/admin`, `/admin/dashboard`, `/admin/participantes`, `/admin/tapas`,
`/admin/fases`.

Un navigation guard global lee `{ sesión local, fase del contest (vía store
alimentado por SSE), progreso de voto }` y redirige automáticamente cuando
cambia algo relevante — así un cambio de fase empuja a todo el mundo a la
pantalla correcta sin que nadie tenga que refrescar ni se le explique nada.

## 10. Imágenes

- `input[type=file][accept=image/*][capture=environment]` para abrir cámara
  directamente en móvil.
- Compresión/redimensionado en el **cliente** antes de subir (ahorra ancho de
  banda en Wi-Fi de fiesta) y de nuevo verificación/reprocesado en el
  **servidor** con `sharp` (nunca confiar solo en el cliente): máximo ~1600px
  en el lado largo, JPEG/WebP calidad ~80%.
- Una única resolución optimizada, sin miniaturas separadas — innecesario a
  esta escala (decenas de fotos, red local), simplifica el pipeline. La grid
  usa la misma imagen con `object-fit: cover`.
- Reorientación según EXIF antes de guardar (fotos verticales de móvil).
- Límite duro de tamaño de subida (multer, ~15MB de original) como red de
  seguridad antes de procesar.
- Validación de MIME real (no solo extensión) antes de procesar con `sharp`.

## 11. Experiencia de error

- Ningún voto/alta se considera guardado hasta confirmación explícita del
  servidor (respuesta 2xx). El estado optimista de UI se revierte si falla.
- Botones de acción se deshabilitan mientras la petición está en curso, para
  evitar doble-tap y duplicados.
- Errores de red muestran mensaje claro + botón "Reintentar" (p. ej. "No
  hemos podido guardar tu voto."), nunca un fallo silencioso.

## 12. Datos de prueba (desarrollo)

Script de seed (`server/src/seed/devSeed.ts`) que genera ~15 participantes,
~18 tapas (con imágenes placeholder locales) y ~20 votantes con votos
aleatorios coherentes con las reglas. Solo se ejecuta explícitamente
(`npm run seed`) y el propio script rechaza correr si
`NODE_ENV=production`, para que nunca contamine el concurso real por
accidente.

## 13. Reset del concurso

`npm run db:reset` (script de mantenimiento, no endpoint HTTP): borra el
fichero SQLite y el contenido de `uploads/`, recrea el schema vacío. Se deja
fuera de la API/UI a propósito — un borrado total no debe depender de una
petición de red durante la fiesta.

## 14. Estructura de directorios

```
PintxosContest/
  package.json                  # scripts raíz (concurrently dev)
  docs/superpowers/specs/
  server/
    package.json / tsconfig.json
    src/
      index.ts                  # bootstrap Express, listen 0.0.0.0
      config.ts                 # env vars centralizadas
      db/{connection.ts, schema.sql, migrate.ts}
      middleware/{adminAuth.ts, userAuth.ts, errorHandler.ts}
      routes/{contest,users,entries,votes,tiebreak,results,admin}.routes.ts
      services/{contest,user,entry,vote,tiebreak,ranking}Service.ts
      realtime/sse.ts
      images/imageProcessor.ts
      types/index.ts
      seed/devSeed.ts
    uploads/                    # gitignored
    data/                       # gitignored, fichero sqlite
    tests/
  frontend/
    package.json / vite.config.ts / tsconfig.json
    index.html
    src/
      main.ts / App.vue
      router/index.ts
      stores/{session,contest,votes}.ts
      services/{api,sse,image}.ts
      composables/useHeartbeat.ts
      components/{common,entries,admin}/
      views/ (+ views/admin/)
      types/index.ts
      styles/{tokens.css, base.css}
```

## 15. Testing

Vitest en ambos paquetes. Backend: tests a nivel de service layer contra
SQLite `:memory:` (rápido, aislado, sin necesidad de `supertest`/HTTP real),
cubriendo como mínimo: máximo tres favoritos, añadir/quitar favorito, impedir
cuarto favorito, impedir voto duplicado, autovoto (permitido/bloqueado según
config), bloqueo de alta tras iniciar concurso, transición entre fases,
desempates (incl. ronda que sigue empatada), cálculo de ranking. Frontend:
Vitest para composables/stores de lógica de favoritos.

## 16. Accesibilidad y responsive

Contraste AA mínimo, botones ≥44px de alto, `alt` en todas las fotos,
`aria-label` en botones solo-icono, navegación por teclado razonable en
desktop (focus visible, orden lógico). Mobile-first sobre 375/390/430px,
luego tablet/desktop con grid de 3-5 columnas.

## 17. Seguridad (proporcional al contexto: fiesta privada en LAN doméstica)

Validación de entrada con `zod` en cada ruta, límite de tamaño de subida,
validación de MIME real, IDs internos no predecibles (uuid) para usuarios y
tapas, PIN admin nunca expuesto en respuestas de error ni logs, rutas admin
siempre detrás de `adminAuth` middleware, nombres de fichero de imagen
aleatorios (evita path traversal vía nombre original).
