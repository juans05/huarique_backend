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
1. **Antes** de dejar pasar la request al handler: si el método es `DELETE` y hay un formateador registrado para esa ruta con paso `before`, lo ejecuta — captura lo que haga falta (típicamente el nombre de la fila que está por borrarse) mientras todavía existe.
2. Deja pasar la request al handler normalmente.
3. Si la respuesta es 2xx y el método es `POST`/`PATCH`/`PUT`/`DELETE`, y se puede resolver un `placeId` (ver abajo), arma el mensaje legible con el formateador de esa ruta (recibe `params`, `body`, la `response` del handler, y lo que haya capturado el paso `before`) y persiste una fila con: `userId`, `placeId`, `message` (ya formateado), `section` (categoría derivada de la ruta), `createdAt`.
4. Si la respuesta no es 2xx, o no se puede resolver un `placeId`, no registra nada — no hay entradas de "intento fallido" en esta versión. Si el paso `before` corrió pero el handler termina fallando, lo capturado se descarta sin persistir nada.

Esto cubre automáticamente cualquier endpoint nuevo que se agregue después bajo `business/*`, sin tocar el interceptor (para rutas sin formateador explícito, el fallback genérico se arma en el paso 3 sin necesitar `before`).

**Por qué el mensaje se arma al capturar la acción, no al mostrarla, y por qué algunas rutas necesitan un paso `before`:** si se resolviera al momento de listar el log (buscando el nombre por ID en ese instante), dos casos se rompen — (a) una eliminación deja el ID sin destino, no hay nombre que buscar después; (b) un plato/premio/campaña editado dos veces mostraría en una entrada vieja el nombre *actual*, no el que tenía cuando pasó esa acción puntual. Resolver en el momento de la acción evita el caso (b). Pero para eliminaciones (caso a) no alcanza con "el momento de la acción" tal cual — se verificó contra el código real que la mayoría de los `DELETE` de este proyecto (`deleteCategory`, `deleteDish`, `TeamController.remove`, `deleteReward`, `deleteKnowledgeBase`) devuelven un mensaje genérico tipo `{ message: 'Eliminado' }`, **sin el nombre de lo borrado** — para cuando el handler responde, la fila ya no existe y no hay de dónde sacar el nombre. Por eso el paso `before` existe específicamente para las rutas `DELETE`: captura el nombre consultando la fila un instante antes de que el propio handler la borre.

### Resolución de `placeId`

No todas las rutas llevan `:placeId` en la URL. Orden de resolución, el primero que resuelva gana:
1. `request.params.placeId`
2. `request.params.id` (patrón usado en `business-places.controller.ts`, ej. `places/:id/profile`) — solo cuando la ruta empieza con `business/places/`.
3. `request.body.placeId` (ej. `POST business/broadcasts`, `POST business/email-campaigns`, donde la sede va en el body, no en la URL).
4. Lo que haya devuelto el paso `before` de esa ruta, si tiene uno — como `before` ya lee la fila por su ID antes de borrarla, puede traer `placeId` en el mismo query, sin costo extra. Esto es necesario, no opcional: se verificó que `DELETE business/knowledge-bases/:kbId` no lleva `placeId` en la URL, no lo recibe en el body, y su respuesta (`{ message: 'Base de conocimiento eliminada' }`) tampoco lo trae — sin este paso, esa ruta puntual nunca podría registrarse pese a estar en la lista de cobertura de abajo.
5. `response.placeId` o `response.data.placeId` — fallback para el resto de las rutas indexadas por otro id (`:conversationId`, `:broadcastId`, `:campaignId`, `:memberId`) cuyo handler devuelve la entidad afectada con `placeId` incluido.

Si ninguna de las 5 resuelve, la request no se registra (no se bloquea ni se rompe — el audit log es best-effort, nunca debe tumbar un request real).

### El body nunca se persiste crudo

Como el mensaje se arma en el momento y es lo único que se guarda (ver modelo de datos abajo), el `token`/`password`/etc. del body jamás llegan a la base — solo pasan por memoria dentro del formateador para construir la frase, y se descartan. No hace falta una lista de campos a excluir: no hay body crudo que sanitizar porque no hay body crudo que guardar.

## Modelo de datos

Tabla nueva `activity_logs` (migración `.sql` + runner, mismo patrón que el resto del proyecto):

```sql
CREATE TABLE wuarike_db.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    user_id UUID REFERENCES wuarike_db.users(id) ON DELETE SET NULL,
    section VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_place_created ON wuarike_db.activity_logs (place_id, created_at DESC);
CREATE INDEX idx_activity_logs_user ON wuarike_db.activity_logs (user_id);
```

`user_id` con `ON DELETE SET NULL` (igual que el resto del esquema) — si una cuenta se borra, el historial de esa sede no desaparece, solo pierde el nombre del actor. `method`/`route` no se guardan — ya cumplieron su función (elegir el formateador correcto) en el momento de capturar la acción; guardarlos también sería dato muerto que nadie vuelve a leer.

## Mensajes legibles: formateadores por ruta

Un registro `ACTIVITY_LABELS: Record<string, RouteFormatter>` (clave: `"MÉTODO ruta-con-:params"`, ej. `"POST business/places/:placeId/team"`). Cada `RouteFormatter` tiene:
- `before?: (params, deps) => Promise<any>` — **solo** para rutas `DELETE`. Consulta la fila por su ID (`params`) y devuelve lo que el mensaje va a necesitar (típicamente `{ name, placeId }` — `placeId` porque en rutas como `knowledge-bases/:kbId` esta consulta es la única fuente posible, ver "Resolución de `placeId`"). Corre antes del handler.
- `format: (params, body, response, before, deps) => Promise<{ message: string; section: string }>` — arma la frase final. Para `POST`/`PATCH`/`PUT` normalmente alcanza con `body` (ya trae los datos nuevos, ej. `body.fullName`, `body.role`); para `DELETE` usa lo que devolvió `before`.

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

- `ActivityLogInterceptor`: test unitario de la resolución de `placeId` (los 4 casos de la cascada) y de que un `DELETE` sin formateador `before` no intenta leer nada (no rompe rutas de borrado que no estén en la tabla).
- Al menos un formateador `DELETE` (ej. eliminar un plato) con test que confirma que el mensaje incluye el nombre capturado en `before`, aunque la respuesta del handler no lo traiga.
- Los formateadores más importantes (equipo, suscripción, conversaciones — los que la sesión ya construyó y revisó en profundidad) llevan un test que confirma el mensaje exacto dado un `params`/`body` de ejemplo.
- El endpoint `GET .../activity` lleva un test de que un miembro sin `canViewActivity` (y no-admin) recibe 403.

## Restricciones globales (consistentes con el resto del proyecto)

- Migración: patrón `.sql` + `run-*.js` en `huarique_backend/migrations/`, con guardas `IF NOT EXISTS` para que sea re-ejecutable sin error.
- `section` como `VARCHAR`, no enum de Postgres (mismo criterio que `role`/`status` en el resto del esquema).
- FK `activity_logs.user_id → users` es `ON DELETE SET NULL` (igual que `conversations` → `users`).
- El interceptor nunca debe romper ni enlentecer perceptiblemente un request real: el registro es fire-and-forget respecto a la respuesta ya enviada al cliente (no se espera el `INSERT` antes de responder), y cualquier error al guardar se loguea y se descarta, nunca se propaga como error HTTP.
