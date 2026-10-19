import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Núcleo multirrubro: tipo de negocio por local, catálogo con productos/servicios,
 * categorías por rubro y "cliente único" (contacts con teléfono normalizado y único por local).
 *
 * Idempotente: se puede volver a correr tras un fallo a medias sin duplicar nada.
 * TypeORM la corre dentro de una sola transacción, por eso el enum de contacts.source se
 * reconstruye en vez de usar ALTER TYPE ... ADD VALUE (un valor agregado en la misma transacción
 * no se puede usar hasta el commit y el paso 7 inserta con 'order' y 'loyalty').
 */

// [slug, name, vertical]: copia literal de BUSINESS_TYPES (src/modules/places/business-types.ts)
// de los tipos no gastronómicos, a propósito sin importarlo: una migración no debe depender
// de código de la app que puede cambiar después. Las categorías de comida ya existen.
const NEW_CATEGORIES: [string, string, string][] = [
  ['bodega', 'Bodega', 'comercio'],
  ['minimarket', 'Minimarket', 'comercio'],
  ['boutique', 'Boutique', 'comercio'],
  ['ferreteria', 'Ferretería', 'comercio'],
  ['jugueteria', 'Juguetería', 'comercio'],
  ['ecommerce', 'Tienda online', 'comercio'],
  ['barberia', 'Barbería', 'belleza'],
  ['peluqueria', 'Peluquería', 'belleza'],
  ['spa', 'Spa', 'belleza'],
  ['consultorio', 'Consultorio', 'salud'],
  ['odontologia', 'Odontología', 'salud'],
  ['fisioterapia', 'Fisioterapia', 'salud'],
  ['petshop', 'Pet shop', 'mascotas'],
  ['veterinaria', 'Veterinaria', 'mascotas'],
  ['grooming', 'Grooming', 'mascotas'],
  ['taller', 'Taller mecánico', 'automotriz'],
  ['lavadero', 'Lavadero', 'automotriz'],
  ['detailing', 'Detailing', 'automotriz'],
  ['lubricentro', 'Lubricentro', 'automotriz'],
  ['servicio_tecnico', 'Servicio técnico', 'servicios'],
  ['canchas', 'Canchas deportivas', 'entretenimiento'],
  ['centro_recreativo', 'Centro recreativo', 'entretenimiento'],
  ['sala_juegos', 'Sala de juegos', 'entretenimiento'],
  ['eventos', 'Eventos', 'entretenimiento'],
];

// Misma regla que normalizePhone (src/modules/orders/order-rules.ts): solo dígitos; sin dígitos -> NULL;
// 9 dígitos que empiezan con 9 -> prefijo 51.
const normalizedPhone = (col: string) => {
  const d = `regexp_replace(${col}, '[^0-9]', '', 'g')`;
  return `CASE WHEN ${d} = '' THEN NULL WHEN length(${d}) = 9 AND left(${d}, 1) = '9' THEN '51' || ${d} ELSE ${d} END`;
};

export class MultirrubroCore1787560000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Columnas. Los locales y platos existentes quedan como restaurante / producto.
    await queryRunner.query(`
      ALTER TABLE wuarike_db.places
      ADD COLUMN IF NOT EXISTS business_type varchar NOT NULL DEFAULT 'restaurante'
    `);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.dishes
      ADD COLUMN IF NOT EXISTS kind varchar NOT NULL DEFAULT 'producto',
      ADD COLUMN IF NOT EXISTS duration_min int
    `);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.categories
      ADD COLUMN IF NOT EXISTS vertical varchar
    `);
    // La entidad Contact ya mapea dni, pero los entornos creados con CreateBusinessTables no lo tienen;
    // el paso 5 lo lee. No se borra en down(): en otros entornos ya existía con datos.
    await queryRunner.query(`ALTER TABLE wuarike_db.contacts ADD COLUMN IF NOT EXISTS dni varchar`);

    // 2. Las categorías de comida existentes son gastronomía; una categoría por tipo no gastronómico.
    //    ON CONFLICT sin destino cubre tanto slug como name (ambos únicos): si ya existe, no se toca.
    await queryRunner.query(`UPDATE wuarike_db.categories SET vertical = 'gastronomia' WHERE vertical IS NULL`);
    for (const [slug, name, vertical] of NEW_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO wuarike_db.categories (id, name, slug, vertical)
         VALUES (gen_random_uuid(), $1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [name, slug, vertical],
      );
    }

    // 3. contacts.source admite 'order' y 'loyalty'. Según cómo se creó la tabla en cada entorno,
    //    source es un enum nativo (sync de TypeORM), un varchar con CHECK (migrations/create_contacts_table.sql)
    //    o un varchar libre (CreateBusinessTables): se detecta y se actúa en consecuencia.
    await queryRunner.query(`
      DO $$
      DECLARE
        col_type oid;
        type_schema text;
        type_name text;
        labels text;
        had_check boolean := false;
        chk record;
      BEGIN
        SELECT a.atttypid INTO col_type
        FROM pg_attribute a
        WHERE a.attrelid = 'wuarike_db.contacts'::regclass AND a.attname = 'source' AND NOT a.attisdropped;

        SELECT n.nspname, t.typname INTO type_schema, type_name
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.oid = col_type AND t.typtype = 'e';

        IF type_name IS NOT NULL THEN
          IF (SELECT count(*) FROM pg_enum WHERE enumtypid = col_type AND enumlabel IN ('order', 'loyalty')) < 2 THEN
            -- Mismo recorrido que genera TypeORM al cambiar un enum: renombrar, crear de nuevo, convertir la columna, borrar el viejo.
            SELECT string_agg(quote_literal(l), ', ' ORDER BY ord) INTO labels FROM (
              SELECT enumlabel::text AS l, enumsortorder::numeric AS ord FROM pg_enum WHERE enumtypid = col_type
              UNION ALL
              SELECT u.x, 1000 + u.i FROM unnest(ARRAY['order', 'loyalty']) WITH ORDINALITY AS u(x, i)
              WHERE u.x NOT IN (SELECT enumlabel::text FROM pg_enum WHERE enumtypid = col_type)
            ) s;
            EXECUTE format('ALTER TYPE %I.%I RENAME TO %I', type_schema, type_name, type_name || '_old');
            EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', type_schema, type_name, labels);
            ALTER TABLE wuarike_db.contacts ALTER COLUMN source DROP DEFAULT;
            EXECUTE format(
              'ALTER TABLE wuarike_db.contacts ALTER COLUMN source TYPE %I.%I USING source::text::%I.%I',
              type_schema, type_name, type_schema, type_name
            );
            ALTER TABLE wuarike_db.contacts ALTER COLUMN source SET DEFAULT 'import';
            EXECUTE format('DROP TYPE %I.%I', type_schema, type_name || '_old');
          END IF;
        ELSE
          FOR chk IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'wuarike_db.contacts'::regclass AND contype = 'c'
              AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'wuarike_db.contacts'::regclass AND attname = 'source')]
          LOOP
            EXECUTE format('ALTER TABLE wuarike_db.contacts DROP CONSTRAINT %I', chk.conname);
            had_check := true;
          END LOOP;
          IF had_check THEN
            ALTER TABLE wuarike_db.contacts ADD CONSTRAINT contacts_source_check
              CHECK (source IN ('whatsapp', 'feedback', 'import', 'order', 'loyalty'));
          END IF;
        END IF;
      END $$
    `);

    // 4. Teléfonos de contacts normalizados con la regla de normalizePhone. Sin dígitos -> NULL
    //    (un NULL nunca choca con el índice único, y no se funden contactos con basura en el teléfono).
    await queryRunner.query(`
      UPDATE wuarike_db.contacts
      SET phone = ${normalizedPhone('phone')}
      WHERE phone IS NOT NULL AND phone IS DISTINCT FROM (${normalizedPhone('phone')})
    `);

    // 5. Deduplicar por (place_id, phone). Sobrevive la fila con más campos no nulos (desempate: la más
    //    antigua, luego el id para ser determinista). El sobreviviente recibe marketing_consent = bool_or del
    //    grupo (true solo si algún registro lo tenía en true) y la unión de tags. Si su name/email/dni/custom_fields
    //    está vacío, hereda el primer valor no vacío del grupo (por created_at): no se pierde ningún dato. Todo en una sola sentencia
    //    para que el ranking se calcule una vez, antes de tocar el sobreviviente.
    //    "Campos no nulos" se cuenta sobre to_jsonb(fila) para no depender de qué columnas tiene cada entorno.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT c.id, c.place_id, c.phone,
               row_number() OVER (
                 PARTITION BY c.place_id, c.phone
                 ORDER BY (SELECT count(*) FROM jsonb_each(to_jsonb(c)) e WHERE e.value <> 'null'::jsonb) DESC,
                          c.created_at ASC NULLS LAST, c.id
               ) AS rn,
               count(*) OVER (PARTITION BY c.place_id, c.phone) AS n
        FROM wuarike_db.contacts c
        WHERE c.phone IS NOT NULL
      ),
      merged AS (
        SELECT r.id AS keep_id,
               bool_or(c.marketing_consent) AS consent,
               jsonb_agg(DISTINCT t.v) FILTER (WHERE t.v IS NOT NULL) AS tags,
               (array_agg(c.name ORDER BY c.created_at ASC NULLS LAST, c.id) FILTER (WHERE nullif(btrim(c.name), '') IS NOT NULL))[1] AS name,
               (array_agg(c.email ORDER BY c.created_at ASC NULLS LAST, c.id) FILTER (WHERE nullif(btrim(c.email), '') IS NOT NULL))[1] AS email,
               (array_agg(c.dni ORDER BY c.created_at ASC NULLS LAST, c.id) FILTER (WHERE nullif(btrim(c.dni), '') IS NOT NULL))[1] AS dni,
               (array_agg(c.custom_fields ORDER BY c.created_at ASC NULLS LAST, c.id)
                 FILTER (WHERE c.custom_fields IS NOT NULL AND c.custom_fields NOT IN ('{}'::jsonb, 'null'::jsonb)))[1] AS custom_fields
        FROM ranked r
        JOIN wuarike_db.contacts c ON c.place_id = r.place_id AND c.phone = r.phone
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.tags) = 'array' THEN c.tags ELSE '[]'::jsonb END
        ) AS t(v) ON true
        WHERE r.rn = 1 AND r.n > 1
        GROUP BY r.id
      ),
      survivors AS (
        UPDATE wuarike_db.contacts k
        SET marketing_consent = m.consent,
            tags = COALESCE(m.tags, k.tags),
            name = COALESCE(nullif(btrim(k.name), ''), m.name, k.name),
            email = COALESCE(nullif(btrim(k.email), ''), m.email, k.email),
            dni = COALESCE(nullif(btrim(k.dni), ''), m.dni, k.dni),
            custom_fields = COALESCE(nullif(nullif(k.custom_fields, '{}'::jsonb), 'null'::jsonb), m.custom_fields, k.custom_fields)
        FROM merged m
        WHERE k.id = m.keep_id
        RETURNING k.id
      )
      DELETE FROM wuarike_db.contacts c
      USING ranked r
      WHERE c.id = r.id AND r.rn > 1
    `);

    // 6. Un contacto por (local, teléfono). Los teléfonos NULL no cuentan.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_place_phone
      ON wuarike_db.contacts (place_id, phone)
    `);

    // 7. Contactos que faltan. Tarjetas primero: ahí el consentimiento se pidió de forma explícita, así que se copia.
    //    Pedidos después, siempre con marketing_consent = false (nunca se infiere). Los contactos que ya existen
    //    no se tocan (ni su consentimiento). El JOIN con places evita violar la FK si quedó una fila huérfana.
    await queryRunner.query(`
      INSERT INTO wuarike_db.contacts (id, place_id, name, phone, source, marketing_consent, created_at, updated_at)
      SELECT gen_random_uuid(), x.place_id, x.name, x.phone, 'loyalty', x.consent, x.created_at, now()
      FROM (
        SELECT lc.place_id,
               ${normalizedPhone('lc.customer_phone')} AS phone,
               (array_agg(lc.customer_name ORDER BY lc.created_at) FILTER (WHERE btrim(lc.customer_name) <> ''))[1] AS name,
               COALESCE(bool_or(lc.marketing_consent), false) AS consent,
               min(lc.created_at) AS created_at
        FROM wuarike_db.loyalty_cards lc
        JOIN wuarike_db.places p ON p.id = lc.place_id
        GROUP BY 1, 2
      ) x
      WHERE x.phone IS NOT NULL
      ON CONFLICT (place_id, phone) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO wuarike_db.contacts (id, place_id, name, phone, source, marketing_consent, created_at, updated_at)
      SELECT gen_random_uuid(), x.place_id, x.name, x.phone, 'order', false, x.created_at, now()
      FROM (
        SELECT o.place_id,
               ${normalizedPhone('o.customer_phone')} AS phone,
               (array_agg(o.customer_name ORDER BY o.created_at DESC) FILTER (WHERE btrim(o.customer_name) <> ''))[1] AS name,
               min(o.created_at) AS created_at
        FROM wuarike_db.orders o
        JOIN wuarike_db.places p ON p.id = o.place_id
        WHERE o.customer_phone IS NOT NULL
        GROUP BY 1, 2
      ) x
      WHERE x.phone IS NOT NULL
      ON CONFLICT (place_id, phone) DO NOTHING
    `);
  }

  /**
   * No se deshace: la deduplicación ni la normalización de teléfonos de contacts (los datos fusionados
   * no se pueden reconstruir), los contactos creados desde tarjetas y pedidos, ni la ampliación de
   * contacts.source (PostgreSQL no permite quitar valores de un enum, y borrar los 'order'/'loyalty' que la
   * app haya creado después perdería datos). Lo que sí revierte: el índice único, las columnas nuevas y las
   * categorías insertadas (salvo las que algún local o solicitud de local ya usa, que se conservan para no romper su FK).
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.uq_contacts_place_phone`);
    await queryRunner.query(
      `DELETE FROM wuarike_db.categories c
       WHERE c.slug = ANY($1::text[])
         AND c.vertical IS DISTINCT FROM 'gastronomia'
         AND NOT EXISTS (SELECT 1 FROM wuarike_db.places p WHERE p.category_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM wuarike_db.place_submissions s WHERE s.category_id = c.id)`,
      [NEW_CATEGORIES.map(([slug]) => slug)],
    );
    await queryRunner.query(`ALTER TABLE wuarike_db.categories DROP COLUMN IF EXISTS vertical`);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.dishes
      DROP COLUMN IF EXISTS kind,
      DROP COLUMN IF EXISTS duration_min
    `);
    await queryRunner.query(`ALTER TABLE wuarike_db.places DROP COLUMN IF EXISTS business_type`);
  }
}
