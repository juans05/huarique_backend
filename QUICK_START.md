# ⚡ Quick Start - Ejecutar Localmente

## 1️⃣ Instala dependencias
```bash
cd d:/Proyecto_juans_/Tapstar_v1/huarique_backend
npm install
# o si usas pnpm:
pnpm install
```

## 2️⃣ Configura `.env`
```bash
# Ya está configurado con:
REDIS_URL="redis://default:password@localhost:6379"
WHATSAPP_WEBHOOK_TOKEN="wuarike_webhook_verification_token_2026"
WHATSAPP_API_VERSION="v20.0"
OPENROUTER_API_KEY="tu_api_key_aqui"  # ← Reemplaza con tu key
```

## 3️⃣ Compila el proyecto
```bash
npm run build
```

## 4️⃣ Inicia el servidor
```bash
npm run start:dev
```

Deberías ver:
```
[Nest] 12345  - 05/25/2026, 10:06 PM   LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 05/25/2026, 10:06 PM   LOG [InstanceLoader] DatabaseModule dependencies initialized
...
[Nest] 12345  - 05/25/2026, 10:07 PM   LOG [NestApplication] Nest application successfully started
```

## 5️⃣ Valida que los endpoints estén listos

### Opción A: En PowerShell (Windows)
```powershell
# GET para verificar el webhook
Invoke-WebRequest -Uri "http://localhost:3001/business/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wuarike_webhook_verification_token_2026&hub.challenge=TEST" -Method GET

# POST para simular mensaje
$body = @{
    entry = @(@{
        changes = @(@{
            value = @{
                metadata = @{ phone_number_id = "123456789" }
                messages = @(@{
                    from = "51987654321"
                    id = "msg_test"
                    text = @{ body = "Hola, ¿qué hay de nuevo?" }
                })
                contacts = @(@{ profile = @{ name = "Juan Test" } })
            }
        })
        field = "messages"
    })
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri "http://localhost:3001/business/webhooks/whatsapp" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

### Opción B: Usa curl (Git Bash o WSL)
```bash
# GET
curl "http://localhost:3001/business/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wuarike_webhook_verification_token_2026&hub.challenge=TEST"

# POST
bash test-webhook.sh
```

## 6️⃣ Verifica que el mensaje se registró en BD

Conecta a PostgreSQL:
```sql
-- Ver conversaciones creadas
SELECT * FROM conversations;

-- Ver mensajes
SELECT conversation_id, message_type, message_body, is_from_ai, created_at 
FROM messages 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver campañas
SELECT * FROM broadcasts;
```

## 7️⃣ Crea una campaña de prueba

```bash
curl -X POST http://localhost:3001/business/broadcasts \
  -H "Content-Type: application/json" \
  -d '{
    "placeId": "PLACE_UUID_AQUI",
    "whatsappNumberId": "WHATSAPP_NUMBER_UUID_AQUI",
    "campaignName": "Test Campaign",
    "templateBody": "Hola {nombre}, esto es una prueba"
  }'
```

## ⚠️ Posibles Errores y Soluciones

### Error: "REDIS_URL is not configured"
- Redis no está corriendo localmente
- Solución: Instala Redis o usa una URL remota en `.env`
- WSL: `sudo apt-get install redis-server && redis-server`
- Docker: `docker run -d -p 6379:6379 redis`

### Error: "Connection refused" (PostgreSQL)
- BD no está accesible
- Solución: Verifica `DATABASE_URL` en `.env`
- Actual: Ya apunta a `38.242.252.183:5432` (Railway)

### Error: "OPENROUTER_API_KEY is invalid"
- No hay key configurada o es incorrecta
- Solución: Usa una key válida de https://openrouter.ai

### Error en compilación TypeScript
- Ejecuta: `npm run lint --fix`
- Luego: `npm run build`

---

## 🧪 Testing con Herramientas Visuales

### Opción 1: Postman
1. Importa esta collection:
```json
{
  "info": { "name": "Wuarikes Phase 1" },
  "item": [
    {
      "name": "Verify Webhook",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/business/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wuarike_webhook_verification_token_2026&hub.challenge=TEST"
      }
    },
    {
      "name": "Send Message",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/business/webhooks/whatsapp",
        "body": { "raw": "{...payload...}" }
      }
    },
    {
      "name": "Create Broadcast",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/business/broadcasts"
      }
    }
  ]
}
```

### Opción 2: Insomnia
- Copia los endpoints de `PHASE_1_API_GUIDE.md`
- Pega en requests
- Click "Send"

---

## 📊 Monitoreo en Tiempo Real

Mientras el servidor está corriendo, abre otra terminal:

```bash
# Ver logs de BullMQ
npm run start:dev 2>&1 | grep -i "bullmq\|broadcast\|whatsapp"

# Ver conversaciones en vivo
watch -n 2 'psql -U wuarike_user -h 38.242.252.183 -d wuarike_db -c "SELECT COUNT(*) FROM conversations; SELECT COUNT(*) FROM messages;"'
```

---

## ✅ Checklist de Validación

- [ ] Servidor inicia sin errores
- [ ] GET /business/webhooks/whatsapp devuelve "TEST" (o challenge)
- [ ] POST /business/webhooks/whatsapp devuelve `{"success": true}`
- [ ] Tabla `conversations` registra nuevo registro
- [ ] Tabla `messages` registra 2 registros (INCOMING + OUTGOING)
- [ ] Endpoint POST /business/broadcasts crea campaña
- [ ] BD tiene 6 tablas: whatsapp_numbers, conversations, messages, broadcasts, knowledge_bases, knowledge_base_chunks

---

## 🎯 Próximo Paso: Frontend

Una vez validado localmente:
1. Ir a `warike_administrativo` (Next.js admin)
2. Crear página `/dashboard/chat` para bandeja de mensajes
3. Crear página `/dashboard/broadcasts` para campañas
4. Conectar a estos endpoints

---

**¿Algo no funciona? Revisa:**
- Logs completos: `console.log` en terminal
- Errores de BD: `psql` para conectar y verificar datos
- Errores de API: Abre DevTools → Network → inspecciona request/response
