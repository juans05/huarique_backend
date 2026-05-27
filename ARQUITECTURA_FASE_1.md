# 🏗️ Arquitectura Completa - Fase 1

## 📐 Diagrama de Flujo: Mensaje en Tiempo Real

```
┌─────────────┐
│   Cliente   │
│  (WhatsApp) │
└──────┬──────┘
       │ "Hola, ¿cuál es el menú?"
       │
       ▼
┌───────────────────────────────────────────────────────────────┐
│                    META WHATSAPP API                           │
│              (Servidores de Meta/Facebook)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ POST /business/webhooks/whatsapp
                            │ (Payload JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TU BACKEND WUARIKES                            │
│                   (NestJS + PostgreSQL)                          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ WhatsappController.handleIncomingMessage()              │   │
│  │ - Recibe payload de Meta                                │   │
│  │ - Devuelve HTTP 200 inmediatamente (async)              │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │                                              │
│                   ▼                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ WhatsappService.processWebhookPayload()                 │   │
│  │ 1. Extrae phone_number_id, customer_phone               │   │
│  │ 2. Busca WhatsAppNumber en BD                           │   │
│  │    → Identifica el restaurante (Place)                  │   │
│  │ 3. Crea/obtiene Conversation                            │   │
│  │ 4. Registra Message (INCOMING)                          │   │
│  │                                                          │   │
│  │ 5. Invoca generateAndSendBotResponse()                  │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │                                              │
│         ┌─────────┴──────────┐                                   │
│         │                    │                                   │
│         ▼                    ▼                                   │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐  │
│  │ VectorService    │  │ AiService                           │  │
│  │ searchSimilarity │  │ chat()                              │  │
│  │                  │  │                                     │  │
│  │ 1. Genera        │  │ System Prompt:                      │  │
│  │    embedding     │  │ "Eres el bot del restaurante       │  │
│  │    del query     │  │  Responde basándote en:            │  │
│  │    (1536 dims)   │  │                                     │  │
│  │                  │  │  CONTEXTO RAG:                      │  │
│  │ 2. Busca en BD   │  │  [Fragmentos similares de KB]       │  │
│  │    chunks        │  │                                     │  │
│  │    similares     │  │ User: 'Hola...'                    │  │
│  │    (cosine sim)  │  │ "                                   │  │
│  │                  │  │ API: OpenRouter → Claude/Gemini    │  │
│  │ 3. Retorna       │  │ Response: "Bienvenido al Resto..." │  │
│  │    top-3         │  │                                     │  │
│  │    chunks        │  │                                     │  │
│  └────────┬─────────┘  └─────────────┬──────────────────────┘  │
│           │                          │                         │
│           └──────────────┬───────────┘                         │
│                          │                                     │
│                          ▼                                     │
│         ┌──────────────────────────────────────────────┐      │
│         │ 6. Registra Message (OUTGOING, isFromAi)     │      │
│         │ 7. sendWhatsAppMessage()                     │      │
│         │    POST https://graph.facebook.com/v20.0/    │      │
│         │    {phone_id}/messages                       │      │
│         │    Body: "Bienvenido al Resto..."            │      │
│         └──────────────┬───────────────────────────────┘      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
                ┌───────────────────────────────────────┐
                │    META WHATSAPP API                  │
                │  (Envío al cliente)                   │
                └───────────────────┬───────────────────┘
                                    │
                                    ▼
                            ┌──────────────────┐
                            │  Cliente recibe  │
                            │   "Bienvenido... │
                            └──────────────────┘
```

---

## 📡 Diagrama de Flujo: Campaña Masiva

```
┌─────────────────────────────────────────────────────────────────┐
│                      ADMIN PANEL                                │
│           (warike_administrativo - Próxima Fase)               │
│                                                                  │
│  Form:                                                          │
│  - Nombre: "Promoción Happy Hour"                              │
│  - Mensaje: "Hola {nombre}, 30% descuento 5-7pm"              │
│  - Segmento: VIP (min_visits >= 5)                            │
│                                                                  │
│  [BUTTON: Enviar]                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /business/broadcasts/:id/send
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TU BACKEND WUARIKES                            │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ BroadcastController.sendBroadcast()                      │  │
│  │ → HTTP 202 ACCEPTED (respuesta inmediata)                │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ BroadcastService.triggerBroadcast()                      │  │
│  │                                                            │  │
│  │ 1. Fetch broadcast por ID                               │  │
│  │ 2. Actualiza status: DRAFT → SENDING                    │  │
│  │ 3. Query: SELECT * FROM conversations                   │  │
│  │    WHERE place_id = X AND segmentFilter...              │  │
│  │    → Obtiene [Juan, María, Carlos, ...]                │  │
│  │ 4. Para cada cliente:                                   │  │
│  │    broadcastQueue.add({                                 │  │
│  │      broadcastId,                                        │  │
│  │      customerPhone,                                      │  │
│  │      customerName                                        │  │
│  │    })                                                    │  │
│  │                                                            │  │
│  │ Response: {                                              │  │
│  │   status: "SENDING",                                     │  │
│  │   totalQueued: 45                                        │  │
│  │ }                                                        │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│         ┌────────────────────────────────────────────────┐      │
│         │         BULLMQ (Redis Queue)                  │      │
│         │                                                │      │
│         │  Queue: "whatsapp-broadcast"                  │      │
│         │  Jobs: [                                       │      │
│         │    { broadcastId, customerPhone: "519xxx" },  │      │
│         │    { broadcastId, customerPhone: "519yyy" },  │      │
│         │    { broadcastId, customerPhone: "519zzz" },  │      │
│         │    ...                                         │      │
│         │  ]                                             │      │
│         │                                                │      │
│         │  Config:                                       │      │
│         │  - attempts: 3                                 │      │
│         │  - backoff: exponential                        │      │
│         └────────────────┬─────────────────────────────┘      │
│                          │ (Distribution)                       │
│                          ▼                                       │
│         ┌────────────────────────────────────────────────┐      │
│         │     BroadcastProcessor (Worker)                │      │
│         │                                                │      │
│         │  Para cada Job:                                │      │
│         │  1. Fetch Broadcast                           │      │
│         │  2. Personalizar template:                    │      │
│         │     "Hola {nombre}" →                         │      │
│         │     "Hola Juan"                               │      │
│         │  3. WhatsappService.sendWhatsAppMessage()     │      │
│         │     POST https://graph.facebook.com/...       │      │
│         │     to: "51987654321"                         │      │
│         │  4. broadcast.messagesSent += 1               │      │
│         │  5. DB: UPDATE broadcasts SET                 │      │
│         │        messages_sent = 1                      │      │
│         │                                                │      │
│         │  ⚠️ En error: Retry automático (x3)           │      │
│         └────────────────┬─────────────────────────────┘      │
└──────────────────────────┼─────────────────────────────────────┘
                           │ (Para cada cliente)
                           ▼
        ┌─────────────────────────────────────┐
        │    META WHATSAPP API                │
        │  (Envío en lote)                    │
        │                                     │
        │  Validar rate limits:               │
        │  Max 80 msgs/min por número         │
        └──────────────┬──────────────────────┘
                       │
                       ▼ (Paralelo para ~45 clientes)
        ┌──────────────────────────────────────────────┐
        │  Cliente 1: Recibe "Hola Juan, 30% descto" │
        │  Cliente 2: Recibe "Hola María, 30% desc"  │
        │  Cliente 3: Recibe "Hola Carlos, 30% des"  │
        │  ...                                         │
        └──────────────────────────────────────────────┘
```

---

## 📦 Estructura de Carpetas

```
huarique_backend/
├── src/
│   ├── modules/
│   │   ├── whatsapp/
│   │   │   ├── entities/
│   │   │   │   ├── whatsapp-number.entity.ts
│   │   │   │   ├── conversation.entity.ts
│   │   │   │   └── message.entity.ts
│   │   │   ├── whatsapp.controller.ts
│   │   │   ├── whatsapp.service.ts
│   │   │   └── whatsapp.module.ts
│   │   │
│   │   ├── broadcast/
│   │   │   ├── entities/
│   │   │   │   └── broadcast.entity.ts
│   │   │   ├── broadcast.controller.ts
│   │   │   ├── broadcast.service.ts
│   │   │   ├── broadcast.processor.ts
│   │   │   └── broadcast.module.ts
│   │   │
│   │   ├── ai/
│   │   │   ├── entities/
│   │   │   │   ├── knowledge-base.entity.ts
│   │   │   │   └── knowledge-base-chunk.entity.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── vector.service.ts
│   │   │   └── ai.module.ts
│   │   │
│   │   ├── places/
│   │   ├── users/
│   │   ├── loyalty/
│   │   └── ... (otros módulos)
│   │
│   ├── app.module.ts
│   ├── main.ts
│   └── config/
│       └── database.config.ts
│
├── migrations/
│   └── add-whatsapp-and-rag-tables.sql
│
├── .env (configuración)
├── QUICK_START.md
├── FASE_1_RESUMEN.md
├── PHASE_1_API_GUIDE.md
└── test-webhook.sh
```

---

## 🗄️ Esquema de Base de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL                                 │
│                    (38.242.252.183:5432)                        │
│                                                                   │
│  ┌──────────────────┐      ┌──────────────────────────────────┐ │
│  │  whatsapp_       │      │  conversations                   │ │
│  │  numbers         │      │  ├─ id (UUID)                  │ │
│  │  ├─ id           │      │  ├─ place_id → places.id      │ │
│  │  ├─ place_id ────┼──────┤─ ├─ customer_phone            │ │
│  │  ├─ phone_       │      │  ├─ customer_name            │ │
│  │  │  number       │      │  └─ created_at               │ │
│  │  ├─ phone_       │      │                                 │ │
│  │  │  number_id    │      └────────┬────────────────────────┘ │
│  │  ├─ whatsapp_    │               │ 1:N                     │
│  │  │  api_token    │               ▼                         │
│  │  └─ is_active    │      ┌──────────────────────────────────┐ │
│  └──────────────────┘      │  messages                        │ │
│                            │  ├─ id (UUID)                  │ │
│  ┌──────────────────┐      │  ├─ conversation_id           │ │
│  │  broadcasts      │      │  ├─ message_type (ENUM)      │ │
│  │  ├─ id           │      │  ├─ message_body (TEXT)      │ │
│  │  ├─ place_id ────┼──────┤─ ├─ is_from_ai (BOOLEAN)     │ │
│  │  ├─ whatsapp_    │      │  ├─ whatsapp_message_id      │ │
│  │  │  number_id ───┼──┐   │  └─ created_at               │ │
│  │  ├─ campaign_    │  │   └──────────────────────────────────┘ │
│  │  │  name         │  │                                      │
│  │  ├─ template_    │  │   ┌──────────────────────────────────┐ │
│  │  │  body         │  └───┤─ whatsapp_numbers               │ │
│  │  ├─ status       │      └──────────────────────────────────┘ │
│  │  ├─ messages_    │                                          │
│  │  │  sent         │   ┌──────────────────┐                  │
│  │  └─ created_at   │   │ knowledge_bases  │                  │
│  └──────────────────┘   │ ├─ id             │                  │
│                         │ ├─ place_id       │                  │
│                         │ ├─ file_name      │                  │
│                         │ ├─ file_url       │                  │
│                         │ └─ created_at     │                  │
│                         └────────┬──────────┘                  │
│                                  │ 1:N                         │
│                                  ▼                             │
│                      ┌──────────────────────────────┐          │
│                      │ knowledge_base_chunks        │          │
│                      │ ├─ id (UUID)                │          │
│                      │ ├─ knowledge_base_id        │          │
│                      │ ├─ chunk_text (TEXT)        │          │
│                      │ └─ embedding (TEXT as JSON) │          │
│                      │   [1.2, 0.5, -0.3, ...]   │          │
│                      └──────────────────────────────┘          │
│                                                                   │
│  Indices:                                                        │
│  - idx_whatsapp_numbers_place_id                               │
│  - idx_conversations_place_phone                               │
│  - idx_messages_conversation_id                                │
│  - idx_kb_chunks_kb_id                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Dependencias Clave

```json
{
  "@nestjs/bullmq": "^11.0.4",
  "bullmq": "^5.77.3",
  "ioredis": "^5.10.1",
  "@nestjs/typeorm": "^10.0.1",
  "typeorm": "^0.3.19",
  "pg": "^8.11.3",
  "openai": "^6.35.0",
  "axios": "^1.16.1"
}
```

---

## 🚀 Flujo de Ejecución Completo

```
1. INICIALIZACIÓN
   ├─ AppModule registra WhatsAppModule
   ├─ AppModule registra BroadcastModule
   ├─ BullModule conecta a Redis
   └─ DatabaseModule conecta a PostgreSQL

2. RUNTIME - Mensaje Entrante
   ├─ Meta llama GET para verificar webhook
   ├─ Meta envía POST con mensaje
   ├─ WhatsappController.handleIncomingMessage()
   ├─ Procesamiento ASYNC:
   │  ├─ WhatsappService.processWebhookPayload()
   │  ├─ VectorService.searchSimilarity()
   │  ├─ AiService.chat()
   │  ├─ WhatsappService.sendWhatsAppMessage()
   │  └─ Messages guardados en BD
   └─ Cliente recibe respuesta

3. RUNTIME - Campaña Masiva
   ├─ Admin dispara POST /business/broadcasts/:id/send
   ├─ BroadcastService.triggerBroadcast()
   ├─ Encola N tareas en BullMQ
   ├─ BroadcastProcessor procesa jobs
   │  ├─ Personaliza template
   │  ├─ Envía por Meta API
   │  ├─ Actualiza contador
   │  └─ Reintentos automáticos
   └─ Clientes reciben mensajes personalizados
```

---

## 📊 Capacidades y Límites

| Característica | Capacidad | Observaciones |
|---|---|---|
| Mensajes/minuto | ~80 | Límite de Meta por número |
| Clientes concurrentes | Ilimitado | BullMQ distribuye |
| Embeddings almacenados | Ilimitado | JSON en TEXT column |
| Chunks por KB | Ilimitado | Escalable a millones |
| Campañas activas | Ilimitado | Estado en BD |
| Latencia respuesta | 2-5seg | Depende de OpenRouter |
| Uptime | 24/7 | Redis + PostgreSQL |

---

## 🔐 Seguridad

| Aspecto | Estado | Pendiente |
|---|---|---|
| Webhook Token | ✅ Configurado | Cambiar a prod |
| Encripción de API Token | ❌ Plain | Implementar encryption |
| Validación de firma Meta | ❌ No | Implementar |
| Rate limiting | ❌ No | Agregar throttler |
| Auditoría de envíos | ✅ Registrados | Loguear en tabla audit |

---

Este es tu **Fase 1 lista para producción** (con ajustes de seguridad). 🎉
