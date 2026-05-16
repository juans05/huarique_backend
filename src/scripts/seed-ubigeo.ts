import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import 'reflect-metadata';
import { Ubigeo } from '../modules/ubigeo/entities/ubigeo.entity';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || process.env.DB_USER || 'doadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'wuarike_db',
    schema: process.env.DB_SCHEMA || 'wuarike_db',
    entities: [Ubigeo],
    ssl: false,
    synchronize: true,
});

async function seedUbigeo() {
    try {
        await AppDataSource.initialize();
        console.log('✅ Conectado a la base de datos');

        const ubigeoRepo = AppDataSource.getRepository(Ubigeo);

        // Datos de ejemplo: Lima, Provincias y Distritos
        const ubigeoData = [
            // Lima - Lima
            { department: 'Lima', province: 'Lima', district: 'Lima', ubigeoCode: '150131', latitude: -12.0464, longitude: -77.0428 },
            { department: 'Lima', province: 'Lima', district: 'Ancón', ubigeoCode: '150102', latitude: -11.7698, longitude: -77.1474 },
            { department: 'Lima', province: 'Lima', district: 'Ate', ubigeoCode: '150106', latitude: -12.0564, longitude: -76.9486 },
            { department: 'Lima', province: 'Lima', district: 'Barranco', ubigeoCode: '150108', latitude: -12.1381, longitude: -77.1639 },
            { department: 'Lima', province: 'Lima', district: 'Breña Alta', ubigeoCode: '150111', latitude: -12.1189, longitude: -77.0428 },
            { department: 'Lima', province: 'Lima', district: 'Breña Baja', ubigeoCode: '150112', latitude: -12.1278, longitude: -77.0544 },
            { department: 'Lima', province: 'Lima', district: 'Chaclacayo', ubigeoCode: '150114', latitude: -12.0147, longitude: -76.8183 },
            { department: 'Lima', province: 'Lima', district: 'Chorrillos', ubigeoCode: '150115', latitude: -12.1661, longitude: -77.1514 },
            { department: 'Lima', province: 'Lima', district: 'Cieneguilla', ubigeoCode: '150116', latitude: -12.1003, longitude: -76.6936 },
            { department: 'Lima', province: 'Lima', district: 'Comas', ubigeoCode: '150117', latitude: -11.9333, longitude: -77.1033 },
            { department: 'Lima', province: 'Lima', district: 'Lurín', ubigeoCode: '150125', latitude: -12.3894, longitude: -76.7392 },
            { department: 'Lima', province: 'Lima', district: 'Miraflores', ubigeoCode: '150131', latitude: -12.1136, longitude: -77.0274 },
            { department: 'Lima', province: 'Lima', district: 'Pachacamac', ubigeoCode: '150132', latitude: -12.2869, longitude: -76.7553 },
            { department: 'Lima', province: 'Lima', district: 'Pucusana', ubigeoCode: '150133', latitude: -12.3928, longitude: -76.6636 },
            { department: 'Lima', province: 'Lima', district: 'Puente Piedra', ubigeoCode: '150134', latitude: -11.8631, longitude: -77.1344 },
            { department: 'Lima', province: 'Lima', district: 'Punta Hermosa', ubigeoCode: '150135', latitude: -12.2969, longitude: -76.6464 },
            { department: 'Lima', province: 'Lima', district: 'San Andrés', ubigeoCode: '150137', latitude: -12.1036, longitude: -76.9233 },
            { department: 'Lima', province: 'Lima', district: 'San Bartolo', ubigeoCode: '150138', latitude: -12.1922, longitude: -77.0564 },
            { department: 'Lima', province: 'Lima', district: 'San Isidro', ubigeoCode: '150139', latitude: -12.0933, longitude: -77.0361 },
            { department: 'Lima', province: 'Lima', district: 'San Juan de Miraflores', ubigeoCode: '150140', latitude: -12.1469, longitude: -77.0511 },
            { department: 'Lima', province: 'Lima', district: 'San Luis', ubigeoCode: '150141', latitude: -12.0622, longitude: -77.0122 },
            { department: 'Lima', province: 'Lima', district: 'San Miguel', ubigeoCode: '150142', latitude: -12.0833, longitude: -77.0833 },
            { department: 'Lima', province: 'Lima', district: 'San Pedro de Lloc', ubigeoCode: '150143', latitude: -12.0000, longitude: -76.9000 },
            { department: 'Lima', province: 'Lima', district: 'Santa Anita', ubigeoCode: '150144', latitude: -12.0778, longitude: -76.9489 },
            { department: 'Lima', province: 'Lima', district: 'Santa María del Mar', ubigeoCode: '150145', latitude: -12.0522, longitude: -76.8972 },
            { department: 'Lima', province: 'Lima', district: 'Santa Rosa', ubigeoCode: '150146', latitude: -12.1122, longitude: -77.0139 },
            { department: 'Lima', province: 'Lima', district: 'Santiago de Surco', ubigeoCode: '150147', latitude: -12.1339, longitude: -77.0311 },
            { department: 'Lima', province: 'Lima', district: 'Surquillo', ubigeoCode: '150148', latitude: -12.1186, longitude: -77.0256 },
            { department: 'Lima', province: 'Lima', district: 'Villa El Salvador', ubigeoCode: '150149', latitude: -12.2358, longitude: -77.0658 },
            { department: 'Lima', province: 'Lima', district: 'Villa María del Triunfo', ubigeoCode: '150150', latitude: -12.2814, longitude: -77.0414 },

            // Lima - Barranca
            { department: 'Lima', province: 'Barranca', district: 'Barranca', ubigeoCode: '150201', latitude: -11.7789, longitude: -77.7506 },
            { department: 'Lima', province: 'Barranca', district: 'Paramonga', ubigeoCode: '150202', latitude: -11.0553, longitude: -77.8283 },
            { department: 'Lima', province: 'Barranca', district: 'Supe', ubigeoCode: '150203', latitude: -11.5828, longitude: -77.6736 },

            // Lima - Cañete
            { department: 'Lima', province: 'Cañete', district: 'Cañete', ubigeoCode: '150301', latitude: -13.0592, longitude: -76.3903 },
            { department: 'Lima', province: 'Cañete', district: 'Cerro Azul', ubigeoCode: '150302', latitude: -13.0761, longitude: -76.3233 },

            // Cusco
            { department: 'Cusco', province: 'Cusco', district: 'Cusco', ubigeoCode: '080131', latitude: -13.5316, longitude: -71.9877 },
            { department: 'Cusco', province: 'Cusco', district: 'Poroy', ubigeoCode: '080142', latitude: -13.5481, longitude: -72.1106 },

            // Arequipa
            { department: 'Arequipa', province: 'Arequipa', district: 'Arequipa', ubigeoCode: '040131', latitude: -16.3996, longitude: -71.5350 },
            { department: 'Arequipa', province: 'Arequipa', district: 'Cayma', ubigeoCode: '040103', latitude: -16.3625, longitude: -71.5269 },
            { department: 'Arequipa', province: 'Arequipa', district: 'Cerro Colorado', ubigeoCode: '040104', latitude: -16.4172, longitude: -71.5764 },

            // Junín
            { department: 'Junín', province: 'Huancayo', district: 'Huancayo', ubigeoCode: '120131', latitude: -12.0705, longitude: -75.2136 },
            { department: 'Junín', province: 'Huancayo', district: 'Chupaca', ubigeoCode: '120108', latitude: -12.0908, longitude: -75.2914 },
        ];

        // Verificar si ya existen datos
        const existingCount = await ubigeoRepo.count();
        if (existingCount > 0) {
            console.log(`✅ La tabla ubigeos ya contiene ${existingCount} registros. Omitiendo inserción.`);
            await AppDataSource.destroy();
            process.exit(0);
        }

        // Insertar datos
        console.log('📍 Insertando datos de ubigeo...');
        for (const data of ubigeoData) {
            const ubigeo = ubigeoRepo.create(data);
            await ubigeoRepo.save(ubigeo);
        }

        console.log(`✅ Seeding completado exitosamente`);
        console.log(`   - Insertados ${ubigeoData.length} registros de ubigeo`);
        await AppDataSource.destroy();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
}

seedUbigeo();
