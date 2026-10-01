# Checkpoint v0.3 — 2026-10-02 — Salas privadas + agente tabula rasa

## Qué se sube

Objetivo usuario: amigos juegan desde casa en salas privadas (1v1 o N+agente) y el agente
NO usa estrategia predefinida: empieza desde cero y crea su propia estrategia razonando
cada victoria/derrota mano tras mano.

### Backend salas (lib/rooms + app/api/rooms)
- types.ts (Room/RoomPlayer), roomEngine.ts (aplicarAccion, calcularActingSeat, cierre
  de ronda, showdown, orquestación del agente), store.ts (CAS por version),
  memory.ts (Map TTL 24h, dev) y kv.ts (Upstash REST por env, prod, sin romper build).
- API force-dynamic: POST /api/rooms, /join, GET /api/rooms/[code] (204 si version
  igual), POST /api/rooms/[code]/action (valida turno server-side; si toca al agente
  actúa el cerebro), /leave.
- Tests: roomEngine 15, store 9, api 11.

### Cerebro tabula rasa (lib/agent)
- brain.ts: priors uniformes 0.5, epsilon 0.9 (suelo 0.1), chooseBrainAction
  epsilon-greedy puro (explora al inicio, explota lo aprendido), reflectOnHand
  (+0.05 ganó / −0.04 perdió, clip [0.05,0.95], ε−2%/mano) → Lesson en español.
- reflection.ts: buildHandRecord + claves de situación calle/cubo/acción.
- NO importa lib/training/** (legado) ni getAiAction (IA predefinida).
- Tests: 4 (tabula rasa, sube/baja prior, decae epsilon).

### UI (app/salas, components/rooms)
- /salas: crear (nombre, 1v1 o mesa 3-6, ambos con agente) + unirse por código.
- /salas/[code]: lobby con jugadores, mesa remota (polling 2s, versionado),
  turno con banner 30s, overlay resultado, salir → leaveRoom.
- AgentDiary: diario visible del agente (últimas 8 lecciones + historial sesión).

## Verificación
- tsc --noEmit: 0 errores
- vitest: 54/54 (7 archivos)
- next build: 14 rutas (/salas, /salas/[code], 8 API rooms, /entrenar, /)
- Smoke E2E real (next start :3457): crear sala JJC55N → unirse → mano completa
  call-down → showdown → handOver con lección del agente:
  "allin 980 en river y fuimos a showdown: mi apuesta no bastó y perdió el bote
  (bajé a 0.46 la prior de ir all-in en river)".

## Pendiente / límites
- Multi-instancia Vercel: requiere KV_REST_API_URL+TOKEN (Upstash) para persistir
  salas entre lambdas; sin ellas memoria local por instancia (dev).
- La mesa local rápida (/) sigue usando ai.ts predefinida; el cerebro que aprende
  vive en salas.
- lib/training/** (/entrenar) queda como legado, no participa en salas.
- Polling 2s (sin WS); turnos validados server-side.


## Ampliación 2026-10-02 — Upstash KV

- Marketplace upstash/upstash-kv instalado (upstash-kv-purple-chair) y conectado al proyecto poker; envs KV_REST_API_* en los 3 entornos.
- fix kv.ts formato REST Upstash (SET array en raiz, GET via result) + kv.test.ts (58/58).
- Verificado: persistencia cross-process local y E2E en produccion (sala 0QV46X en KV). Deploy poker-5xc1tm169.
