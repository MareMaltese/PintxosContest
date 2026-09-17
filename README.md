# Pincho Party 🍢

Aplicación web para organizar un concurso informal de pinchos/tapas durante
una fiesta privada, pensada para usarse **desde el móvil, dentro de la Wi-Fi
de casa**, sin instalar nada ni crear cuentas.

Cada invitado entra desde el navegador, pone su nombre, fotografía su pincho
con la cámara del móvil y, cuando el anfitrión da inicio al concurso, todo el
mundo vota sus 3 favoritos. Al cerrar la votación se calcula un ranking sin
empates (con rondas de desempate si hace falta) y se revela un podio.

El nombre "Pincho Party" está centralizado en `server/src/config.ts`
(`APP_NAME`) por si se quiere cambiar más adelante.

> **Estado actual:** el backend está completo y probado. El frontend cubre
> el registro de participante y de tapas (bienvenida, ¿has traído pincho?,
> foto + datos del pincho, confirmación con número asignado, sala de
> espera con actualización en vivo por SSE). La galería, la votación, los
> resultados y el panel de administración por interfaz todavía no
> existen — se prueban directamente contra la API REST.

## Stack técnico

- **Backend:** Node.js + Express + TypeScript, `better-sqlite3` (SQLite),
  `sharp` (procesado de imágenes), `zod` (validación), Vitest (tests).
- **Frontend:** Vue 3 + Composition API + TypeScript + Vite + Vue Router +
  Pinia + `@lucide/vue` (iconos), Vitest + `@vue/test-utils` (tests).
- Todo pensado para ejecutarse en un único ordenador de la red local, sin
  dependencias de servicios en la nube.

El diseño completo (arquitectura, modelo de datos, máquina de estados,
endpoints) vive en [`docs/superpowers/specs/2026-09-16-pincho-party-design.md`](docs/superpowers/specs/2026-09-16-pincho-party-design.md).

## Estructura del repositorio

```
PintxosContest/
  server/          Backend: API REST + SQLite + procesado de imágenes
  frontend/        Frontend: Vue 3 + Vite + TypeScript
  docs/            Specs y planes de implementación
  package.json     Scripts de conveniencia que delegan en server/ y frontend/
```

---

## Requisitos previos

Solo hace falta instalar **Node.js 22 o superior** (incluye `npm`) en el
ordenador que va a hacer de servidor:

- **Windows:** descarga el instalador "LTS" desde
  [nodejs.org](https://nodejs.org/) y ejecútalo (siguiente, siguiente,
  siguiente). Comprueba la instalación abriendo PowerShell y ejecutando
  `node -v` (debe mostrar `v22.x` o superior).
- **macOS:** descarga el instalador desde [nodejs.org](https://nodejs.org/),
  o si usas [Homebrew](https://brew.sh/): `brew install node`. Comprueba con
  `node -v` en una terminal.

También necesitas `git` si vas a clonar el repositorio (en Windows,
[git-scm.com](https://git-scm.com/); en macOS suele venir con las
"Command Line Tools" — `xcode-select --install` si no lo tienes).

**No hace falta instalar Python, Visual Studio Build Tools ni ningún
compilador C/C++.** Las dos únicas dependencias con partes nativas
(`better-sqlite3` para la base de datos y `sharp` para las fotos) ya
incluyen binarios precompilados para Windows y macOS dentro del propio
paquete de npm — no compilan nada en tu máquina al instalar.

## Instalación

```bash
git clone <url-del-repositorio>
cd PintxosContest
npm run install:all
```

Esto instala las dependencias de `server/` y `frontend/`.

## Desarrollo

```bash
npm run dev
```

Levanta backend y frontend a la vez: la API en `http://localhost:3000`
(recarga automática con `tsx watch`) y el frontend en
`http://localhost:5173` (recarga automática de Vite). Mientras desarrollas,
abre **`http://localhost:5173`** en el navegador — no `:3000` — el frontend
redirige por su cuenta las peticiones `/api` y `/uploads` a la API.

Para trabajar solo dentro de un paquete:

```bash
cd server    # o: cd frontend
npm run dev         # servidor con recarga automática
npm test             # suite de tests (Vitest)
npm run typecheck    # comprobación de tipos, sin emitir nada
npm run lint         # ESLint
```

## Build

```bash
npm run build
```

Compila el frontend a `frontend/dist/` y el backend TypeScript a
`server/dist/`. En producción (`NODE_ENV=production`), el backend sirve
`frontend/dist/` automáticamente — no hace falta un servidor aparte para el
frontend.

## Arrancar el servidor (producción)

```bash
npm run build
npm start
```

`npm start` ejecuta `node server/dist/index.js`. El servidor escucha siempre
en `0.0.0.0` (nunca solo en `localhost`), que es lo que permite acceder desde
otros dispositivos de la misma red — ver más abajo.

## Configuración

El backend se configura por variables de entorno (todas opcionales, con
valores por defecto sensatos para desarrollo). Ver `server/src/config.ts`:

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto en el que escucha el servidor |
| `ADMIN_PIN` | `0000` | PIN del panel de administración (**cámbialo antes de la fiesta**) |
| `DB_PATH` | `server/data/pincho-party.db` | Ruta del fichero SQLite |
| `UPLOADS_DIR` | `server/uploads` | Carpeta donde se guardan las fotos |
| `NODE_ENV` | `development` | `production` activa servir el frontend compilado y bloquea el seed de desarrollo |

Ejemplo para arrancar con un PIN propio:

```bash
# Windows (PowerShell)
$env:ADMIN_PIN = "4271"; npm start

# macOS / Linux
ADMIN_PIN=4271 npm start
```

## PIN administrador

El panel de administración (rutas `/api/admin/...`) está protegido por un PIN
simple: cada petición debe incluir el header `X-Admin-Pin` con el valor
configurado en `ADMIN_PIN`. No hay usuarios ni contraseñas de administrador,
solo ese PIN — pensado para un anfitrión, no para un sistema multiusuario.

Cambia el PIN por defecto (`0000`) antes de la fiesta real.

## Dónde se almacenan las fotografías

En la carpeta indicada por `UPLOADS_DIR` (por defecto `server/uploads/`,
ignorada por git). Cada foto se guarda como un `.webp` optimizado (máximo
1600px de lado largo, reorientada según EXIF) con un nombre aleatorio — la
base de datos solo guarda esa ruta, nunca el archivo original sin procesar.
Se sirven como estáticos bajo `/uploads/<archivo>.webp`.

## Dónde está SQLite

Un único fichero indicado por `DB_PATH` (por defecto
`server/data/pincho-party.db`, ignorado por git), junto con sus ficheros
auxiliares de modo WAL (`-wal`, `-shm`) mientras el servidor está en marcha.
No hay ningún otro servicio de base de datos que instalar o arrancar.

## Cómo hacer backup

Con el servidor parado (para evitar copiar el fichero a medio escribir),
copia estos dos elementos a otro sitio:

```bash
cp server/data/pincho-party.db   /ruta/de/backup/
cp -r server/uploads              /ruta/de/backup/
```

Restaurar es el proceso inverso: copia ambos de vuelta a sus rutas originales
antes de arrancar el servidor.

## Cómo resetear el concurso

```bash
npm run db:reset
```

Borra por completo el fichero SQLite y la carpeta de fotos, dejando el
concurso como recién instalado (fase `REGISTRATION`, sin participantes ni
tapas). Es un script de mantenimiento pensado para ejecutarse a mano entre
pruebas o antes de la fiesta real — deliberadamente **no** existe como acción
disponible desde la API, para que un borrado tan destructivo nunca dependa de
una petición de red.

### Datos de prueba (solo desarrollo)

```bash
npm run seed
```

Genera 20 participantes, 18 tapas (con imágenes de relleno) y votos
aleatorios coherentes con las reglas del concurso, dejando la fase en
`VOTING`. El propio script se niega a ejecutarse si `NODE_ENV=production`,
así que no hay riesgo de contaminar el concurso real por accidente.

## Cómo acceder desde otros móviles de la misma Wi-Fi

El ordenador que ejecuta `npm start` (o `npm run dev`) hace de servidor. Los
invitados acceden desde el navegador de su móvil a la IP local de ese
ordenador, por ejemplo:

```
http://192.168.1.35:3000
```

Ambos deben estar conectados a la **misma red Wi-Fi**.

### Averiguar la IP local

**Windows:**

```powershell
ipconfig
```

Busca el adaptador de red activo (Wi-Fi o Ethernet) y anota su
`Dirección IPv4` (algo como `192.168.1.35`).

**macOS:**

```bash
ipconfig getifaddr en0
```

Si usas Wi-Fi y `en0` no da resultado, prueba `en1`. Alternativa desde el
Finder: **Preferencias del Sistema → Red → Wi-Fi**, la IP aparece ahí
directamente.

### Cosas que pueden bloquear el acceso

- **Firewall de Windows/macOS:** la primera vez que arrancas el servidor, el
  sistema puede preguntar si permites conexiones entrantes para Node.js —
  acepta. Si no accedes desde otro móvil, revisa que el firewall no esté
  bloqueando el puerto (`3000` por defecto).
- **Puerto:** asegúrate de usar el mismo puerto en la URL que el que imprime
  el servidor al arrancar (`PORT`, por defecto `3000`).
- **Red de invitados/aislada:** algunos routers domésticos con red de
  invitados aíslan los dispositivos entre sí (AP/client isolation). Si los
  móviles no ven al servidor aunque estén en la misma Wi-Fi, prueba a
  desactivar esa opción en el router o usa la red principal.
- **URLs hardcodeadas:** el proyecto está pensado para que el frontend llame
  siempre a rutas relativas (`/api/...`), nunca a `localhost` fijo, así que
  el mismo build funciona sea cual sea la IP desde la que se acceda.

## API

Mientras el frontend no cubre todas las pantallas, las partes que faltan se
ejercen directamente contra la API REST. Referencia completa de endpoints,
reglas de negocio y máquina de estados del concurso en la spec:
[`docs/superpowers/specs/2026-09-16-pincho-party-design.md`](docs/superpowers/specs/2026-09-16-pincho-party-design.md).

Comprobación rápida de que el servidor responde:

```bash
curl http://localhost:3000/api/contest
# {"phase":"REGISTRATION","allowSelfVote":false,"resultsRevealedAt":null}
```
