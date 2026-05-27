# 🚀 Fase 1: API de Conversaciones WhatsApp + RAG + Broadcast

## 📋 Resumen Técnico
Tu backend Wuarikes ahora integra:
- ✅ **Webhook de WhatsApp**: Recibe mensajes en tiempo real desde Meta
- ✅ **Cerebro RAG**: Búsqueda semántica inteligente en la knowledge base del restaurante
- ✅ **Respuestas Automáticas**: Bot de IA que responde según el contexto del menú/FAQs
- ✅ **Campañas Masivas**: Envío de boletines/promociones a través de BullMQ

---

## 📡 Endpoints de WhatsApp

### 1. **GET** `/business/webhooks/whatsapp` - Verificación de Meta
Usado por Meta para verificar que tu webhook es válido.

**Parámetros de Query:**
```
?hub.mode=subscribe&hub.verify_token=wuarike_webhook_verification_token_2026&hub.challenge=xxxxx
```

**Respuesta exitosa:**
```
HTTP 200
{challenge}
```

---

### 2. **POST** `/business/webhooks/whatsapp` - Recibir Mensajes
Meta llama este endpoint cada vez que un cliente envía un mensaje a tu restaurante.

**Payload de ejemplo:**
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": {
          "phone_number_id": "123456789"
        },
        "messages": [{
          "from": "51987654321",
          "id": "msg_12345",
          "text": {
            "body": "Hola, ¿cuál es el menú de hoy?"
          }
        }],
        "contacts": [{
          "profile": {
            "name": "Juan Pérez"
          }
        }]
      }
    }],
    "field": "messages"
  }]
}
```

**Respuesta:**
```json
{
  "success": true
}
```

**Flujo interno:**
1. Webhook identifica el restaurante por `phone_number_id`
2. Crea/obtiene la conversación del cliente
3. Registra el mensaje como `INCOMING`
4. Busca contexto similar en la knowledge base (RAG)
5. Genera respuesta con IA
6. Envía respuesta a través de Meta API
7. Registra respuesta como `OUTGOING` con flag `isFromAi: true`

---

## 📬 Endpoints de Broadcast (Campañas Masivas)

### 1. **POST** `/business/broadcasts` - Crear Campaña
Crea un nuevo borrador de campaña.

**Request:**
```json
{
  "placeId": "uuid-del-restaurante",
  "whatsappNumberId": "uuid-del-numero-whatsapp",
  "campaignName": "Promoción de Happy Hour",
  "templateBody": "Hola {nombre}, te invitamos a nuestro Happy Hour de 5-7pm con 30% descuento. ¡Te esperamos!",
  "segmentFilter": {
    "type": "VIP",
    "minVisits": 5
  }
}
```

**Response:**
```json
{
  "id": "uuid-broadcast",
  "placeId": "uuid",
  "campaignName": "Promoción de Happy Hour",
  "status": "DRAFT",
  "messagesSent": 0,
  "createdAt": "2026-05-25T22:10:00Z"
}
```

---

### 2. **GET** `/business/broadcasts/place/:placeId` - Listar Campañas
Obtiene todas las campañas de un restaurante.

**Response:**
```json
[
  {
    "id": "uuid-broadcast",
    "campaignName": "Promoción de Happy Hour",
    "status": "DRAFT",
    "messagesSent": 0,
    "createdAt": "2026-05-25T22:10:00Z"
  },
  ...
]
```

---

### 3. **GET** `/business/broadcasts/:broadcastId` - Obtener Detalles
Obtiene información completa de una campaña.

---

### 4. **POST** `/business/broadcasts/:broadcastId/send` - Disparar Campaña
Envía la campaña a todos los clientes segmentados.

**Response:**
```json
{
  "broadcastId": "uuid",
  "status": "SENDING",
  "totalQueued": 45,
  "message": "Campaign enqueued for 45 customers"
}
```

**Cómo funciona:**
1. Cambia el estado de la campaña a `SENDING`
2. Obtiene la lista de clientes que coinciden con `segmentFilter`
3. **Encola cada cliente en BullMQ** con reintentos exponenciales
4. Worker procesa envíos a ~100 msgs/min (respeta límites de Meta)
5. Actualiza `messagesSent` por cada envío exitoso

---

## 🧠 Endpoints de RAG (Knowledge Base)

### Próximamente en Fase 2:
- `POST /ai/knowledge-bases` - Subir documento (PDF, TXT, MD)
- `GET /ai/knowledge-bases/:placeId` - Listar documentos
- `DELETE /ai/knowledge-bases/:kbId` - Eliminar documento
- `POST /ai/knowledge-bases/:kbId/sync` - Reindicar fragmentos (embeddings)

---

## 🔧 Variables de Entorno Requeridas

```env
# WhatsApp (Meta Developer Portal)
WHATSAPP_WEBHOOK_TOKEN=wuarike_webhook_verification_token_2026
WHATSAPP_API_VERSION=v20.0

# Redis (BullMQ para campañas masivas)
REDIS_URL=redis://default:password@localhost:6379

# OpenRouter (para IA e embeddings)
OPENROUTER_API_KEY=tu_api_key_aqui
```

---

## 📊 Flujo de Datos

### Conversación en Tiempo Real:
```
1. Cliente envía → WhatsApp
2. Meta Webhook → Tu Backend
3. Registra INCOMING message
4. Busca contexto en RAG (embeddings)
5. IA genera respuesta (Claude/Gemini vía OpenRouter)
6. Registra OUTGOING message
7. Envía → WhatsApp API → Cliente
```

### Campaña Masiva:
```
1. Admin crea campaña en BD
2. Endpoint /send encola N tareas
3. BullMQ distribuye entre workers
4. Cada worker:
   - Personaliza template ({nombre})
   - Envía por WhatsApp API
   - Incrementa counter
   - Reintentos exponenciales en error
```

---

## 🧪 Testing Local

Ejecuta desde tu shell:

```bash
# 1. Inicia servidor en watch mode
npm run start:dev

# 2. En otra terminal, testea el webhook
bash test-webhook.sh

# 3. O usa curl directamente:
curl -X POST http://localhost:3001/business/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{...payload...}'
```

---

## 📈 Próximas Fases

**Fase 2:**
- ✨ Upload de Knowledge Base (PDF/TXT/MD)
- ✨ Sincronización de embeddings
- ✨ Panel de Chats (React en warike_administrativo)
- ✨ Segmentación inteligente en campañas

**Fase 3:**
- 🎯 Integración con Google Sheets (menú dinámico)
- 🎯 Analytics de conversaciones
- 🎯 A/B testing en campañas
- 🎯 Transferencia manual a operador humano

---

## ⚠️ Consideraciones de Producción

1. **Rate Limiting de Meta:** Max 80 msgs/min por número
2. **Almacenamiento de Vectors:** Guardar embeddings en `knowledge_base_chunks` como JSON text
3. **Retry Logic:** BullMQ ya implementa retries exponenciales
4. **Logs:** Revisa `console.log` en whatsapp.service y broadcast.processor

---

**¿Listo para testear? 🚀**

Sigue estos pasos:
1. Configura tu `.env` con credenciales reales
2. Ejecuta `npm run start:dev`
3. Usa un herramienta como **ngrok** para exponer localhost a Meta
4. Configura el webhook en Meta Developer Portal
5. ¡Recibe tu primer mensaje! 🎉
