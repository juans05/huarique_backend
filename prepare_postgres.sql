-- Script para preparar PostgreSQL en Contabo para la migración
-- Ejecutar esto en pgAdmin antes de correr npm run migrate

-- 1. Crear usuario si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'wuarike_user') THEN
        CREATE USER wuarike_user WITH PASSWORD 'your_secure_password_here';
    END IF;
END
$$;

-- 2. Crear base de datos si no existe (ejecutar esto conectado a 'postgres' database)
-- Nota: Si ya existe wuarike_db, este comando dará error pero es OK
CREATE DATABASE wuarike_db OWNER wuarike_user;

-- 3. IMPORTANTE: Ahora debes DESCONECTARTE y RECONECTARTE a la base de datos 'wuarike_db'
-- En pgAdmin: Click derecho en wuarike_db -> Query Tool
-- Luego ejecuta el resto del script:

-- 4. Habilitar extensión PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 5. Dar permisos al usuario
GRANT ALL PRIVILEGES ON DATABASE wuarike_db TO wuarike_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO wuarike_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO wuarike_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO wuarike_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO wuarike_user;

-- 6. Verificar PostGIS
SELECT PostGIS_Version();

-- Deberías ver algo como: "3.3 USE_GEOS=1 USE_PROJ=1..."
