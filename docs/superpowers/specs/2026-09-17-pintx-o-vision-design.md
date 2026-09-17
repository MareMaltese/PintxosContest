# Pinch-o-visión — diseño

**Fecha:** 2026-09-17
**Estado:** aprobado por el usuario, pendiente de plan de implementación
**Depende de:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md` (esquema, fases, autenticación, convenciones ya establecidas — este documento solo añade lo nuevo)

## 1. Propósito y alcance

Un segundo sistema de puntuación, independiente del de favoritos, al estilo
Eurovisión: cada invitado reparte como máximo una medalla de ORO, una de
PLATA y una de BRONCE entre las tapas (nunca dos medallas a la misma tapa).
Coexiste con el sistema de favoritos — ambos corren en paralelo durante la
misma fase `VOTING`, un pincho puede ser favorito de alguien y a la vez
recibir una medalla suya.

**Incluye:** botones de medalla en la pantalla de detalle de tapa, pestaña
de admin con el recuento en vivo, desempate del podio de medallas
(reutilizando la infraestructura de `TiebreakRound` existente), pantalla de
podio para invitados (top 3, oculta hasta que el admin revela resultados).

**No incluye:** ranking completo de medallas para invitados (solo ven el
podio de 3), un botón de revelado propio (reutiliza
"Mostrar resultados" del concurso principal), límite en cuántas tapas puede
puntuar como votante más allá de la propia regla de una medalla de cada
tipo.

## 2. Modelo de datos — añadidos

```sql
MedalVote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  medal TEXT NOT NULL CHECK (medal IN ('GOLD','SILVER','BRONZE')),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId),  -- una medalla máxima por tapa y votante
  UNIQUE (userId, medal)     -- un oro, una plata, un bronce máximo por votante (estilo Eurovisión)
)
```

`TiebreakRound` gana una columna para poder resolver empates de ambos
sistemas con la misma infraestructura:

```sql
ALTER TABLE TiebreakRound ADD COLUMN kind TEXT NOT NULL DEFAULT 'MAIN'
  CHECK (kind IN ('MAIN','MEDAL'));
```

`TiebreakCandidate` y `TiebreakVote` no cambian — ya referencian `roundId`,
así que el `kind` de una ronda es implícito a través de él. Un voto de
desempate sigue siendo "elige una de las tapas empatadas", tanto para
desempatar puestos del ranking principal como puestos del podio de
medallas.

## 3. Reglas de negocio

- Puntuación: ORO = 5, PLATA = 3, BRONCE = 1.
- Solo se puede asignar/quitar una medalla durante la fase `VOTING` (la
  misma ventana que los favoritos). Fuera de esa fase: `409
  NOT_VOTING_PHASE`, igual que en `voteService`.
- Autovoto: bloqueado salvo `Contest.allowSelfVote = true` (reutiliza el
  mismo flag), igual que en favoritos.
- Asignar una medalla que ya tenías en otra tapa la **mueve** ahí — no da
  error. Volver a pulsar la misma medalla en la misma tapa la quita. Esto
  se implementa como una operación *upsert* transaccional: dentro de una
  transacción, se borra cualquier fila `(userId, medal)` existente y, si el
  nuevo valor no es `null`, se inserta la nueva.
- Privacidad: el recuento de medallas (`GET /api/admin/medal-votes`) es
  visible para el admin en cualquier momento, sin restricción de fase — a
  diferencia del ranking principal, esta pantalla está pensada como
  herramienta de admin en directo, no como resultado final. Los invitados
  **no** tienen acceso a ningún recuento ni a su propio progreso agregado
  más allá de saber qué medallas han repartido ellos mismos
  (`GET /api/medal-votes/me`).
- Los invitados no ven el podio de medallas hasta que
  `Contest.resultsRevealedAt` no sea `null` — el mismo campo y el mismo
  botón de admin ("Mostrar resultados") que revela el ranking principal.
  No hay un segundo botón de revelado.
- El podio de medallas muestra únicamente el top 3 por puntuación total
  (no el ranking completo). Empates dentro del top 3 se resuelven con una
  ronda de desempate (ver §4) antes de que el concurso pueda pasar a
  `RESULTS` — igual que exige el ranking principal en el spec base.

## 4. Máquina de estados — extensión de `advance()`

`services/tiebreakService.ts::advance()` pasa de mirar solo el ranking
principal a resolver **primero todos los empates del podio principal
(`kind='MAIN'`) y después todos los empates del podio de medallas
(`kind='MEDAL'`)**, antes de fijar `phase = RESULTS`:

```
advance(db):
  para cada grupo empatado del podio principal (computeStandings):
    si ese rango no está resuelto (kind='MAIN'):
      si ya hay una ronda abierta → devolver {phase: TIEBREAK}
      abrir ronda kind='MAIN', targetRank=rango, candidatos=grupo
      devolver {phase: TIEBREAK, openedRound}
  # principal totalmente resuelto
  para cada grupo empatado del podio de medallas (computeMedalStandings):
    si ese rango no está resuelto (kind='MEDAL'):
      si ya hay una ronda abierta → devolver {phase: TIEBREAK}
      abrir ronda kind='MEDAL', targetRank=rango, candidatos=grupo
      devolver {phase: TIEBREAK, openedRound}
  # ambos resueltos
  setPhase(db, 'RESULTS')
  devolver {phase: RESULTS}
```

`openRound`, `isRankResolved` y `closeRound` ganan un parámetro/columna
`kind` que se propaga sin cambiar su lógica de tally (la tabla
`TiebreakVote` no distingue de qué sistema viene el empate; solo cuenta
votos por `entryId` dentro de esa `roundId`).

**Orden final del podio de medallas:** `computeMedalStandings` calcula el
ranking por puntuación total (empates ordenados por `number` ascendente,
igual que el principal). Para el **podio de invitados** (top 3), si algún
puesto fue resuelto por una `TiebreakRound` de `kind='MEDAL'`, el ganador de
esa ronda se coloca por delante de los demás miembros del grupo empatado
que perdieron esa ronda concreta — el orden final refleja el resultado del
desempate, no solo la puntuación bruta.

El admin sigue pulsando los mismos dos botones de siempre
("Cerrar votación" y "Cerrar ronda de desempate"); no hay botones nuevos.
Una ronda de desempate de medallas se ve y se vota exactamente igual que
una del ranking principal — la pantalla de invitado solo necesita indicar
de qué sistema es esa ronda concreta (campo `kind` en la respuesta de
`GET /api/tiebreak/current`).

## 5. API — añadidos

Autenticación igual que el resto: `X-User-Id` para invitados,
`X-Admin-Pin` para admin.

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/medal-votes/me` | usuario | `{ gold: entryId\|null, silver: entryId\|null, bronze: entryId\|null }` |
| PUT | `/api/medal-votes/:entryId` | usuario | `{ medal: 'GOLD'\|'SILVER'\|'BRONZE'\|null }`; solo en `VOTING`; mueve/quita según reglas de §3 |
| GET | `/api/admin/medal-votes` | admin | recuento en vivo, sin restricción de fase: `[{ entryId, number, name, gold, silver, bronze, total }]` ordenado por `total` desc |
| GET | `/api/medal-votes/results` | usuario | solo si `phase = RESULTS` y `resultsRevealedAt` no es null; top 3 con `{ rank, entryId, number, entryName, creatorName, medal, total }` |

`GET /api/tiebreak/current` y `POST /api/tiebreak/vote` (ya existentes) no
cambian de forma — su respuesta ya incluye la ronda completa, a la que se
le añade el campo `kind` para que el frontend sepa qué rotular.

## 6. Frontend — invitado

- **Botones de medalla:** en `EntryDetailView.vue`, junto al botón de
  favorito, durante `VOTING`: tres botones ORO/PLATA/BRONCE. El
  seleccionado (si lo hay para esa tapa) se resalta con un reborde del
  color de su metal. Nuevos tokens en `styles/tokens.css`:
  `--color-silver` y `--color-bronze` (junto al `--color-gold` ya
  existente). Mismas reglas de autovoto que el botón de favorito
  (deshabilitado + motivo si es tu propia tapa y `allowSelfVote` es falso).
- **Icono:** el usuario aporta un `medal.svg` propio — se envuelve como
  componente Vue en `frontend/src/components/icons/MedalIcon.vue` (prop
  `size`, `fill="currentColor"`), siguiendo el mismo patrón que los iconos
  de `@lucide/vue` ya en uso.
- **Pantalla de podio:** nueva vista `PintxOVisionResultsView.vue`
  (ruta `/pinch-o-vision`). Si `resultsRevealedAt` es `null`, muestra un
  mensaje de espera ("Todavía no se ha revelado el podio de
  Pinch-o-visión"). Si ya está revelado, muestra los 3 puestos: número de
  pincho, nombre de quien lo registró, e icono `MedalIcon` dentro de un
  círculo del color del metal correspondiente (oro/plata/bronce).
- **Desempate de medallas:** reutiliza la vista de desempate ya prevista
  para el ranking principal (Fase G, todavía sin construir en frontend) —
  el mismo componente sirve para ambos `kind`, mostrando una etiqueta
  distinta según el campo `kind` de la ronda ("Desempate del concurso" vs.
  "Desempate de Pinch-o-visión").

## 7. Frontend — admin

- Nueva pestaña **"Pinch-o-visión"** en `AdminNav.vue`, ruta
  `/admin/pinch-o-vision`, vista `AdminMedalVotesView.vue`: tabla en vivo
  (sin restricción de fase) con columnas Nº, nombre, ORO, PLATA, BRONCE,
  Total, ordenada por Total descendente. Reutiliza el patrón de polling o
  carga simple ya usado en el resto del panel de admin.

## 8. Testing

Backend (Vitest, `:memory:`, mismo patrón que el resto): un oro/plata/
bronce máximo por votante, una medalla máxima por tapa y votante, mover
una medalla de una tapa a otra, quitar una medalla, bloqueo fuera de
`VOTING`, autovoto bloqueado/permitido según config, cálculo de
`computeMedalStandings` y su puntuación total, `advance()` resolviendo
primero empates `MAIN` y después `MEDAL` antes de pasar a `RESULTS`, orden
final del podio tras un desempate de medallas.

Frontend (Vitest): store de medallas (equivalente al store de favoritos,
pero con 3 slots exclusivos), botones de medalla en `EntryDetailView`,
tabla de admin, pantalla de podio (oculta antes del reveal, visible
después).
