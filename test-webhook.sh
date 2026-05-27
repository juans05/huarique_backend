#!/bin/bash

# Script para testear el webhook de WhatsApp
# Uso: bash test-webhook.sh

PORT=3001
WEBHOOK_URL="http://localhost:${PORT}/business/webhooks/whatsapp"
WEBHOOK_TOKEN="wuarike_webhook_verification_token_2026"

echo "🧪 Testing WhatsApp Webhook..."
echo ""

# 1. Test de verificación (GET)
echo "1️⃣ Verificando webhook con Meta..."
curl -X GET "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${WEBHOOK_TOKEN}&hub.challenge=TEST_CHALLENGE_123"
echo ""
echo ""

# 2. Test de mensaje entrante (POST)
echo "2️⃣ Enviando mensaje de prueba..."
curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": {
            "phone_number_id": "123456789"
          },
          "messages": [{
            "from": "51987654321",
            "id": "msg_test_123",
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
  }'
echo ""
echo ""

# 3. Consultar conversaciones creadas
echo "3️⃣ Verificando conversaciones en BD (después de unos segundos)..."
sleep 2
echo "   (Ejecuta en tu DB: SELECT * FROM conversations;)"
echo ""

echo "✅ Test completado"
