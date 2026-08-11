# Registro de Actividad (Audit Log) — Spec de Diseño

**Fecha:** 2026-08-11
**Alcance:** Registrar automáticamente toda acción administrativa de escritura sobre una sede (equipo, suscripción, conversaciones, carta, fidelización, campañas, PlazBot, base de IA, números de WhatsApp, perfil del negocio), mostrarla en una pantalla nueva `/actividad`, con visibilidad configurable por persona.

**No-alcance (fase futura, spec aparte):** Notificaciones internas (avisos proactivos de eventos). Esta spec es solo el registro pasivo — quien quiera enterarse, entra a `/actividad` y lo lee. No hay emails, pushes, ni badges de "no leído".

---

## Contexto

Con equipos multi-usuario (Admin/Supervisor/Agente, Task 6) y facturación por sede (2026-08-11), varias personas actúan sobre la misma sede sin que quede registro de quién hizo qué. El pedido explícito del usuario: cobertura de **todo lo administrativo del panel**, con mensajes legibles (no solo "POST /team"), sin instrumentar cada uno de los ~35 endpoints a mano.

## Decisión de arquitectura: interceptor automático, no llamadas manuales

Instrumentar cada controller con una llamada explícita a un `ActivityLogService.log(...)` cubriría bien la semántica pero exige tocar ~15 archivos y mantenerlos sincronizados con cada endpoint nuevo que se agregue después — alto riesgo de huecos.

En cambio: un **`ActivityLogInterceptor`** de NestJS, registrado a nivel global, que:
1. Deja pasar la request al handler normalmente.
2. Si la respuesta es 2xx y el método es `POST`/`PATCH`/`PUT`/`DELETE`, y se puede resolver un `placeId` (ver abajo), persiste una fila cruda (sin formatear) con: `userId`, `placeId`, `method`, `route` (el patrón de Nest, ej. `business/places/:placeId/team/:memberId`), `params` (params de la URL), `body` (sanitizado), `createdAt`.
3. Si la respuesta no es 2xx, o no se puede resolver un `placeId`, no registra nada — no hay entradas de "intento fallido" en esta versión.

Esto cubre automáticamente cualquier endpoint nuevo que se agregue después bajo `business/*`, sin tocar el interceptor.

### Resolución de `placeId`

No todas las rutas llevan `:placeId` en la URL. Orden de resolución, el primero que resuelva gana:
1. `request.params.placeId`
2. `request.params.id` (patrón usado en `business-places.controller.ts`, ej. `places/:id/profile`) — solo cuando la ruta empieza con `business/places/`.
3. `request.body.placeId` (ej. `POST business/broadcasts`, `POST business/email-campaigns`, donde la sede va en el body, no en la URL).
4. `response.placeId` o `response.data.placeId` — fallback para rutas indexadas por otro id (`:conversationId`, `:broadcastId`, `:campaignId`, `:memberId`, `:kbId`) cuyo handler devuelve la entidad afectada, que ya trae `placeId`.

Si ninguna de las 4 resuelve, la request no se registra (no se bloquea ni se rompe — el audit log es best-effort, nunca debe tumbar un request real).

### Sanitización del body

Antes de persistir, se eliminan (nunca se guardan) los campos: `token`, `password`, `currentPassword`, `newPassword`, `whatsappApiToken`, y cualquier campo que matchee `/password|token|secret/i`. El resto del body se guarda tal cual, en una columna `jsonb`.

## Modelo de datos

Tabla nueva `activity_logs` (migración `.sql` + runner, mismo patrón que el resto del proyecto):

```sql
CREATE TABLE wuarike_db.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    user_id UUID REFERENCES wuarike_db.users(id) ON DELETE SET NULL,
    method VARCHAR(10) NOT NULL,
    route VARCHAR(255) NOT NULL,
    params JSONB,
    body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_place_created ON wuarike_db.activity_logs (place_id, created_at DESC);
CREATE INDEX idx_activity_logs_user ON wuarike_db.activity_logs (user_id);
```

`user_id` con `ON DELETE SET NULL` (igual que el resto del esquema) — si una cuenta se borra, el historial de esa sede no desaparece, solo pierde el nombre del actor.

## Mensajes legibles: formateadores por ruta

Un registro `ACTIVITY_LABELS: Record<string, LabelFormatter>` (clave: `"MÉTODO ruta-con-:params"`, ej. `"POST business/places/:placeId/team"`), donde cada `LabelFormatter` es una función `(params, body, deps) => Promise<string>`. Se ejecuta **al listar** (`GET .../activity`), no al guardar — así la escritura queda liviana y un formateador se puede mejorar después sin migrar datos viejos.

`deps` da acceso a los repos necesarios para resolver nombres cuando el `body`/`params` solo tienen un ID (ej. `memberId` → nombre de la persona, `dishId` → nombre del plato, `campaignId` → nombre de la campaña). Cobertura completa de rutas (una entrada por cada endpoint de escritura bajo `business/*`, construida en la fase de implementación):

- **Equipo:** agregar/editar rol o accesos/quitar miembro.
- **Suscripción:** suscribir (con plan)/cancelar.
- **Conversaciones:** reclamar/soltar/reasignar/cerrar/cambiar modo bot-humano/enviar mensaje manual (preview corto, no el texto completo)/sincronizar desde PlazBot.
- **Carta:** crear/editar/eliminar categoría o plato.
- **Perfil del negocio:** editar perfil/sincronizar con Google/vincular ubicación de Google.
- **Fidelización:** crear o editar el programa/crear-editar-eliminar premio/canjear premio.
- **Campañas WhatsApp (Broadcasts):** crear/enviar/programar/cancelar/editar.
- **Email Marketing:** crear/editar/eliminar/enviar/completar/programar/desprogramar campaña.
- **Base de IA:** subir documento/indexar URL/eliminar base de conocimiento.
- **PlazBot Setup:** configurar bot de la sede (las rutas globales del workspace — templates, campañas de PlazBot — no tienen sede y quedan fuera de este log).
- **Números de WhatsApp:** conectar/desconectar número.
- **Onboarding:** reclamar sede.

Ruta sin formateador explícito (no debería pasar con la lista de arriba, pero por si se agrega un endpoint nuevo sin actualizar la tabla): fallback genérico derivado del primer segmento significativo de la ruta (ignorando `business`, `places` y los parámetros `:algo`) — ej. `business/places/:placeId/menu/items` → `"Modificó Carta"`, `business/broadcasts` → `"Modificó Campañas"`. Nunca una entrada vacía o un error.

## Visibilidad

Columna nueva `can_view_activity BOOLEAN NOT NULL DEFAULT false` en `place_team_members` (misma migración). Un Admin siempre puede ver el log de su sede (no se guarda explícito, se resuelve igual que el resto de los chequeos: `member.role === 'admin' || member.canViewActivity`). El checkbox "Puede ver el registro de actividad" se agrega al formulario de alta/edición en `/equipo`, independiente del rol elegido.

## Backend — endpoint nuevo

`GET business/places/:placeId/activity` — paginado (`page`, `limit`), filtros opcionales `userId` y `section` (la categoría derivada de la ruta, ej. `team`, `subscription`, `conversations`). Gateado por el chequeo de visibilidad de arriba (no por `PlaceRoleGuard`, que es todo-o-nada por rol — acá hace falta el flag por persona). Devuelve, por fila: `id`, `createdAt`, actor (`userId`, nombre), `message` (ya formateado por el paso de arriba), `section`.

## Frontend

- Página nueva `app/(dashboard)/actividad/page.tsx`, agregada al sidebar (mismo patrón que `/equipo`), gateada por `canIaTotal` como el resto de esta familia de features — visible solo si el endpoint no devuelve 403 (si el usuario no tiene `canViewActivity`, la página muestra "no tenés acceso a esto, pedile a un Admin que te habilite" en vez de redirigir).
- Lista cronológica, agrupada por día, con: ícono/color por sección, mensaje, actor, hora. Filtro por persona (dropdown con el equipo) y por sección (dropdown con las categorías de arriba).
- En `/equipo`, el form de alta y el modo edición de cada miembro suman el checkbox "Puede ver el registro de actividad".

## Testing

- `ActivityLogInterceptor`: test unitario de la resolución de `placeId` (los 4 casos de la cascada) y de la sanitización del body (campos sensibles nunca llegan a persistirse).
- Los formateadores más importantes (equipo, suscripción, conversaciones — los que la sesión ya construyó y revisó en profundidad) llevan un test que confirma el mensaje exacto dado un `params`/`body` de ejemplo.
- El endpoint `GET .../activity` lleva un test de que un miembro sin `canViewActivity` (y no-admin) recibe 403.

## Restricciones globales (consistentes con el resto del proyecto)

- Migración: patrón `.sql` + `run-*.js` en `huarique_backend/migrations/`, con guardas `IF NOT EXISTS` para que sea re-ejecutable sin error.
- `method`/`route` como `VARCHAR`, no enum de Postgres (mismo criterio que `role`/`status` en el resto del esquema).
- FK `activity_logs.user_id → users` es `ON DELETE SET NULL` (igual que `conversations` → `users`).
- El interceptor nunca debe romper ni enlentecer perceptiblemente un request real: el registro es fire-and-forget respecto a la respuesta ya enviada al cliente (no se espera el `INSERT` antes de responder), y cualquier error al guardar se loguea y se descarta, nunca se propaga como error HTTP.
