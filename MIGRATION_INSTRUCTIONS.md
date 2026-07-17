# 🚀 Instrucciones de Migración SQL para Railway

## Paso 1: Acceder a Railway PostgreSQL Console

1. Ve a **https://railway.app**
2. Selecciona tu proyecto **Warike Backend**
3. En el panel, busca **PostgreSQL** y haz click
4. En la pestaña **Data**, selecciona **Query** o **Connect**
5. Abre la **Query Console** (botón azul "Query" o similar)

## Paso 2: Ejecutar Migrations

Copia y pega **cada bloque de código** por separado en la Query Console:

### Paso 2.1: Crear tabla `public_feedback`

```sql
CREATE TABLE IF NOT EXISTS wuarike_db.public_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  customer_name VARCHAR(255),
  customer_contact VARCHAR(255),
  device_id UUID,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'contacted')),
  resolved_at TIMESTAMP,
  admin_notes TEXT,
  marketing_consent BOOLEAN DEFAULT FALSE,
  consent_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Resultado esperado:** ✅ `CREATE TABLE` (o tabla ya existe)

### Paso 2.2: Crear índices para `public_feedback`

```sql
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_id ON wuarike_db.public_feedback(place_id);
CREATE INDEX IF NOT EXISTS idx_public_feedback_created_at ON wuarike_db.public_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_public_feedback_rating ON wuarike_db.public_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_rating ON wuarike_db.public_feedback(place_id, rating);
CREATE INDEX IF NOT EXISTS idx_public_feedback_status ON wuarike_db.public_feedback(status);
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_status ON wuarike_db.public_feedback(place_id, status);
```

**Resultado esperado:** ✅ `CREATE INDEX` (6 veces)

### Paso 2.3: Crear tabla `place_scans`

```sql
CREATE TABLE IF NOT EXISTS wuarike_db.place_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL,
  device_id UUID,
  source VARCHAR(20) NOT NULL DEFAULT 'qr' CHECK (source IN ('nfc', 'qr', 'direct')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Resultado esperado:** ✅ `CREATE TABLE` (o tabla ya existe)

### Paso 2.4: Crear índices para `place_scans`

```sql
CREATE INDEX IF NOT EXISTS idx_place_scans_place_id ON wuarike_db.place_scans(place_id);
CREATE INDEX IF NOT EXISTS idx_place_scans_created_at ON wuarike_db.place_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_place_scans_source ON wuarike_db.place_scans(source);
CREATE INDEX IF NOT EXISTS idx_place_scans_place_source ON wuarike_db.place_scans(place_id, source);
CREATE INDEX IF NOT EXISTS idx_place_scans_place_date ON wuarike_db.place_scans(place_id, created_at);
```

**Resultado esperado:** ✅ `CREATE INDEX` (5 veces)

## Paso 3: Verificar que las tablas fueron creadas

Copia y pega esta query para verificar:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'wuarike_db'
AND table_name IN ('public_feedback', 'place_scans');
```

**Resultado esperado:** 
```
public_feedback
place_scans
```

## Paso 4: Verificar estructura de tablas

### Columnas de `public_feedback`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'wuarike_db' AND table_name = 'public_feedback'
ORDER BY ordinal_position;
```

**Resultado esperado:**
```
id             | uuid
place_id       | uuid
rating         | integer
comment        | text
customer_name  | character varying
customer_contact | character varying
device_id      | uuid
status         | character varying
resolved_at    | timestamp without time zone
admin_notes    | text
marketing_consent | boolean
consent_timestamp | timestamp without time zone
created_at     | timestamp without time zone
```

### Columnas de `place_scans`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'wuarike_db' AND table_name = 'place_scans'
ORDER BY ordinal_position;
```

**Resultado esperado:**
```
id         | uuid
place_id   | uuid
device_id  | uuid
source     | character varying
created_at | timestamp without time zone
```

## Paso 5: Test Insert (Opcional pero Recomendado)

Para probar que todo funciona, haz un INSERT de prueba. **Reemplaza el `place_id` con uno real de tu base de datos:**

```sql
INSERT INTO wuarike_db.public_feedback (
  place_id,
  rating,
  comment,
  customer_name,
  marketing_consent
) VALUES (
  'TU_PLACE_ID_AQUI'::UUID,
  5,
  'Test feedback',
  'Test User',
  true
);
```

```sql
INSERT INTO wuarike_db.place_scans (
  place_id,
  source
) VALUES (
  'TU_PLACE_ID_AQUI'::UUID,
  'nfc'
);
```

**Resultado esperado:** ✅ `INSERT 0 1`

## Paso 6: Verificar datos

```sql
SELECT COUNT(*) as total FROM wuarike_db.public_feedback;
SELECT COUNT(*) as total FROM wuarike_db.place_scans;
```

**Resultado esperado:** Si insertaste datos de prueba, deberías ver `1` o más registros.

---

## ❌ Si algo falla:

1. **"Table already exists"** → Ignorar, es normal si ya existe
2. **"Column X does not exist"** → Contactar soporte, check database structure
3. **"Permission denied"** → Verificar que tienes permisos en `wuarike_db`
4. **"Invalid UUID"** → Usar format válido UUID en INSERTs de prueba

## ✅ Success Checklist

- [ ] Tabla `public_feedback` creada
- [ ] Tabla `place_scans` creada
- [ ] 6 índices en `public_feedback`
- [ ] 5 índices en `place_scans`
- [ ] SELECT retorna ambas tablas
- [ ] (Opcional) Test INSERT funcionó
- [ ] Backend puede guardar feedback
- [ ] Frontend muestra datos en Feedback/Reputación

---

**Después de ejecutar las migraciones, la plataforma estará lista para:**
- ✅ Guardar feedback de NFC/QR
- ✅ Rastrear escaneos (NFC vs QR)
- ✅ Mostrar analytics en Reputación
- ✅ Listar quejas en dashboard
