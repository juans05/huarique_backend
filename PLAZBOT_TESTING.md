# 🧪 Testing Plazbot Gateway Integration

**Documento de testing para validar la implementación**

---

## ✅ Checklist Implementación

### Entidades
- [x] `RestaurantDocument` entity creada
- [x] `DocumentEmbedding` entity creada
- [x] `TenantPlazbotConfig` entity creada

### Services
- [x] `DocumentsService` implementado
- [x] `PlazBotService` implementado
- [x] `TenantPlazbotConfigService` implementado
- [x] `ChatProcessorService` implementado

### Controllers
- [x] `PlazBotWebhookController` implementado
- [x] `DocumentsController` implementado
- [x] `PlazbotConfigController` implementado

### Módulos
- [x] `DocumentsModule` importado en AppModule
- [x] `PlazbotConfigModule` importado en AppModule
- [x] `PlazBotModule` importado en AppModule
- [x] `ChatModule` importado en AppModule

### BD
- [x] Migración creada: `1726570800000-CreatePlazbotTables.ts`
- [ ] Migración ejecutada en BD
- [ ] Tablas verificadas en BD

---

## 🧪 Test 1: Crear Documento (Menú)

### Endpoint
```
POST /api/documents
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Body
```json
{
  "type": "menu",
  "title": "Menú Principal 2026",
  "content": "Entrada:\n- Ceviche Mixto $18\n- Causa Limeña $16\n\nPrincipales:\n- Lomo Saltado $22\n- Ajo de Mariscos $20\n\nPostres:\n- Flan $8\n- Suspiro Limeño $7",
  "tags": ["seafood", "traditional", "peruvian"]
}
```

### Esperado
```json
{
  "id": "uuid",
  "userId": "user-id",
  "type": "menu",
  "title": "Menú Principal 2026",
  "content": "...",
  "tags": ["seafood", "traditional", "peruvian"],
  "isActive": true,
  "createdAt": "2026-05-28T...",
  "updatedAt": "2026-05-28T..."
}
```

---

## 🧪 Test 2: Obtener Documento

### Endpoint
```
GET /api/documents/menu
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
```

### Esperado
```json
{
  "id": "uuid",
  "type": "menu",
  "title": "Menú Principal 2026",
  "content": "...",
  "isActive": true
}
```

---

## 🧪 Test 3: Configurar Plazbot

### Endpoint
```
POST /api/plazbot-setup/connect
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Body
```json
{
  "apiKey": "pk_test_xxxxxxxxxxxxx",
  "workspaceId": "ws_restaurant_001",
  "agentId": "agent_001",
  "systemPrompt": "Eres un asistente inteligente para nuestro restaurante. Responde siempre en español.",
  "tone": "professional"
}
```

### Esperado
```json
{
  "id": "uuid",
  "userId": "user-id",
  "plazBotWorkspaceId": "ws_restaurant_001",
  "agentId": "agent_001",
  "tone": "professional",
  "isActive": true,
  "connectedAt": "2026-05-28T...",
  "updatedAt": "2026-05-28T..."
}
```

---

## 🧪 Test 4: Simular Webhook de Plazbot

### Endpoint
```
POST /api/webhooks/plazbot
```

### Body (sin autenticación)
```json
{
  "event": "message_received",
  "workspace_id": "ws_restaurant_001",
  "contact": {
    "id": "c_12345",
    "name": "Juan López",
    "phone": "+51987654321"
  },
  "message": {
    "id": "msg_001",
    "body": "¿Qué opciones vegetarianas tienen?"
  }
}
```

### Esperado
```json
{
  "status": "ok"
}
```

### Logs esperados
```
[ChatProcessorService] Processing: Juan López - "¿Qué opciones vegetarianas tienen?"
[PlazBotService] Message sent to c_12345
[ChatProcessorService] Generated response: "Nuestras opciones vegetarianas incluyen..."
```

---

## 📊 Flujo Completo de Testing

### Paso 1: Preparar Entorno
```bash
# 1. Asegurarse que .env tiene:
ANTHROPIC_API_KEY=sk-ant-xxxxx
PLAZBOT_BASE_URL=https://api.plazbot.com
DATABASE_URL=postgresql://user:pass@localhost:5432/wuarike_db
NODE_ENV=development
```

### Paso 2: Iniciar Servidor
```bash
npm run start:dev
```

Esperar a que diga: "Listening on port 3000"

### Paso 3: Ejecutar Tests Manuales

#### Test 3a: Autenticarse
```bash
# Obtener JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu@email.com",
    "password": "password"
  }'

# Guardar el token en variable
TOKEN="eyJhbGc..."
```

#### Test 3b: Crear documento
```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "menu",
    "title": "Menú",
    "content": "Ceviche $18\nCausa $16",
    "tags": ["seafood"]
  }'
```

#### Test 3c: Conectar Plazbot
```bash
curl -X POST http://localhost:3000/api/plazbot-setup/connect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "pk_test_xxxxx",
    "workspaceId": "ws_001",
    "agentId": "agent_001"
  }'
```

#### Test 3d: Simular webhook
```bash
curl -X POST http://localhost:3000/api/webhooks/plazbot \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_received",
    "workspace_id": "ws_001",
    "contact": {
      "id": "c_123",
      "name": "Cliente",
      "phone": "+51987654321"
    },
    "message": {
      "id": "msg_001",
      "body": "¿Qué tienen?"
    }
  }'
```

---

## 🔍 Verificaciones

### Base de Datos
```sql
-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'wuarike_db' 
AND table_name IN ('restaurant_documents', 'document_embeddings', 'tenant_plazbot_configs');

-- Verificar documentos
SELECT * FROM restaurant_documents;

-- Verificar configs
SELECT id, user_id, plazbot_workspace_id, is_active FROM tenant_plazbot_configs;
```

### Logs
```bash
# Ver logs en tiempo real
tail -f logs/application.log | grep "ChatProcessor\|PlazBot\|Documents"

# Buscar errores
grep -i "error" logs/application.log | tail -20
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module '@anthropic-ai/sdk'"
```bash
npm install @anthropic-ai/sdk
npm run build
```

### Error: "Plazbot API key invalid"
1. Verificar que `apiKey` está correcto
2. Verificar que `workspaceId` existe en Plazbot
3. Verificar que el workspace está activo

### Error: "User not found"
1. Asegurarse que JWT token es válido
2. Verificar que el usuario existe en BD
3. Verificar que el token no está expirado

### Error: "Document not found"
1. Crear documento primero (Test 1)
2. Verificar que `userId` coincide
3. Verificar que `type` es correcto

---

## 📈 Próximos Pasos

1. [ ] Ejecutar tests manuales en Postman
2. [ ] Configurar Plazbot real con webhook
3. [ ] Testing con cliente WhatsApp real
4. [ ] Implementar encriptación de API keys
5. [ ] Agregar más tipos de documentos (policies, FAQs, hours)
6. [ ] Implementar RAG con embeddings
7. [ ] Deploy a producción

---

**Fecha:** 2026-05-28  
**Estado:** Listo para testing manual
