
import { DataSource, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import 'reflect-metadata';

// Core
import { User } from '../modules/users/entities/user.entity';
import { UserFollow } from '../modules/users/entities/user-follow.entity';

// Places
import { Place } from '../modules/places/entities/place.entity';
import { PlaceSubmission } from '../modules/places/entities/place-submission.entity';
import { PlaceClaim } from '../modules/places/entities/place-claim.entity';
import { PlaceReport } from '../modules/places/entities/place-report.entity';
import { Tag } from '../modules/places/entities/tag.entity';
import { Amenity } from '../modules/places/entities/amenity.entity';
import { Category } from '../modules/places/entities/category.entity';

// Checkins
import { Checkin } from '../modules/checkins/entities/checkin.entity';
import { CheckinLike } from '../modules/checkins/entities/checkin-like.entity';
import { CheckinPhoto } from '../modules/checkins/entities/checkin-photo.entity';

// Gamification
import { Badge } from '../modules/gamification/entities/badge.entity';
import { Mission } from '../modules/gamification/entities/mission.entity';
import { UserBadge } from '../modules/gamification/entities/user-badge.entity';
import { UserMission } from '../modules/gamification/entities/user-mission.entity';
import { UserPointsLog } from '../modules/gamification/entities/user-points-log.entity';
import { UserStreak } from '../modules/gamification/entities/user-streak.entity';

// Auth
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';

// Ubigeo
import { Ubigeo } from '../modules/ubigeo/entities/ubigeo.entity';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'doadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'wuarike_db',
    schema: process.env.DB_SCHEMA || 'wuarike_db',
    entities: [
        User,
        UserFollow,
        Place,
        PlaceSubmission,
        PlaceClaim,
        PlaceReport,
        Tag,
        Amenity,
        Checkin,
        CheckinLike,
        CheckinPhoto,
        Badge,
        Mission,
        UserBadge,
        UserMission,
        UserPointsLog,
        UserStreak,
        RefreshToken,
        Ubigeo,
        Category
    ],
    ssl: false,
    synchronize: false,
});

const commonTags = [
    { name: 'Casero', slug: 'casero' },
    { name: 'Menú', slug: 'menu' },
    { name: 'Al paso', slug: 'al-paso' },
    { name: 'Tradicional', slug: 'tradicional' },
    { name: 'Romántico', slug: 'romantico' },
    { name: 'Familiar', slug: 'familiar' },
    { name: 'Barato', slug: 'barato' },
    { name: 'Gourmet', slug: 'gourmet' },
    { name: '24 Horas', slug: '24-horas' },
    { name: 'Desayuno', slug: 'desayuno' }
];

const commonAmenities = [
    { name: 'WiFi', slug: 'wifi' },
    { name: 'Estacionamiento', slug: 'parking' },
    { name: 'Terraza', slug: 'terrace' },
    { name: 'Pet Friendly', slug: 'pet-friendly' },
    { name: 'Pago con Tarjeta', slug: 'card-payment' },
    { name: 'Yape/Plin', slug: 'digital-payment' },
    { name: 'TV', slug: 'tv' },
    { name: 'Aire Acondicionado', slug: 'ac' },
    { name: 'Juegos para niños', slug: 'kids-games' },
    { name: 'Bar', slug: 'bar' }
];

const sanMiguelWuarikes = [
    // --- REAL PLACES ---
    {
        name: "El Bolivariano",
        description: "Clásico de clásicos. Criollo, pisco y buena sazón. Ideal para familias.",
        lat: -12.0746,
        long: -77.0847,
        category: "Criollo",
        rarity: "LEGENDARY",
        address: "Calle Rosa Toledo 289, Pueblo Libre (Cerca a San Miguel)",
        district: "San Miguel",
        openHoursText: "12:00 PM - 10:00 PM",
        rating: 4.8,
        priceMin: 35,
        priceMax: 60,
        averagePrice: 45.00,
        tags: ['Tradicional', 'Criollo', 'Familiar'],
        amenities: ['WiFi', 'Estacionamiento', 'Terraza', 'Pago con Tarjeta']
    },
    {
        name: "Anticuchería La Norteña",
        description: "Los mejores anticuchos de la zona. Esquina famosa.",
        lat: -12.0901,
        long: -77.0921,
        category: "Carretilla",
        rarity: "EPIC",
        address: "Av. La Marina 1200",
        openHoursText: "6:00 PM - 11:00 PM",
        rating: 4.6,
        priceMin: 15,
        priceMax: 30,
        averagePrice: 25.00,
        tags: ['Al paso', 'Tradicional'],
        amenities: ['Yape/Plin']
    },
    {
        name: "Siete Sopas (San Miguel)",
        description: "Sopas 24 horas. Colas largas pero vale la pena.",
        lat: -12.0792,
        long: -77.0975,
        category: "Sopas",
        rarity: "RARE",
        address: "Av. La Marina 2500",
        openHoursText: "24 Horas",
        rating: 4.5,
        priceMin: 25,
        priceMax: 40,
        averagePrice: 30.00,
        tags: ['24 Horas', 'Familiar', 'Casero'],
        amenities: ['WiFi', 'Estacionamiento', 'Pago con Tarjeta', 'Yape/Plin']
    },
    {
        name: "Cevichería El Pez On",
        description: "Ceviche fresco y abundante. Precio justo.",
        lat: -12.0850,
        long: -77.0910,
        category: "Marino",
        rarity: "COMMON",
        address: "Av. Universitaria 450",
        openHoursText: "11:00 AM - 5:00 PM",
        rating: 4.2,
        priceMin: 25,
        priceMax: 45,
        averagePrice: 35.00,
        tags: ['Familiar', 'Tradicional'],
        amenities: ['WiFi', 'Pago con Tarjeta', 'Terraza']
    },
    {
        name: "Chifa Titi",
        description: "Uno de los mejores chifas de Lima. Elegante y delicioso.",
        lat: -12.0920,
        long: -77.0990,
        category: "Chifa",
        rarity: "LEGENDARY",
        address: "Av. Javier Prado Oeste 1200",
        openHoursText: "1:00 PM - 10:00 PM",
        rating: 4.9,
        priceMin: 40,
        priceMax: 80,
        averagePrice: 60.00,
        tags: ['Gourmet', 'Familiar'],
        amenities: ['WiFi', 'Estacionamiento', 'Pago con Tarjeta', 'Aire Acondicionado'],
        isVerified: true,
        verifiedAt: new Date("2024-02-15T14:30:00Z")
    },
    {
        name: "Caldo de Gallina 'El Tío'",
        description: "Para 'bajarla' después de la fiesta. Caldo potente.",
        lat: -12.0815,
        long: -77.0895,
        category: "Sopas",
        rarity: "COMMON",
        address: "Av. Precursores 300",
        openHoursText: "6:00 PM - 6:00 AM",
        rating: 4.0,
        priceMin: 12,
        priceMax: 20,
        averagePrice: 15.00,
        tags: ['Al paso', '24 Horas', 'Casero'],
        amenities: ['Yape/Plin']
    },
    {
        name: "Tacos 'El Mexicano'",
        description: "Tacos al paso, picante real.",
        lat: -12.0760,
        long: -77.0860,
        category: "Mexicana",
        rarity: "RARE",
        address: "Parque de las Leyendas (Frente)",
        openHoursText: "5:00 PM - 11:00 PM",
        rating: 4.3,
        priceMin: 15,
        priceMax: 25,
        averagePrice: 20.00,
        tags: ['Al paso'],
        amenities: ['Yape/Plin', 'Terraza']
    },
    {
        name: "Pollos a la Brasa 'Hikari'",
        description: "Pollo a la brasa con toque oriental. Papas crocantitas.",
        lat: -12.0830,
        long: -77.0930,
        category: "Pollo a la Brasa",
        rarity: "EPIC",
        address: "Av. La Mar 2300",
        openHoursText: "12:00 PM - 10:00 PM",
        rating: 4.7,
        priceMin: 30,
        priceMax: 60,
        averagePrice: 40.00,
        tags: ['Familiar', 'Tradicional'],
        amenities: ['WiFi', 'Estacionamiento', 'Pago con Tarjeta']
    },
    {
        name: "Sanguchería 'El Chinito' (San Miguel)",
        description: "Chicharrón legendario. Desayunos domingueros.",
        lat: -12.0780,
        long: -77.0950,
        category: "Sanguchería",
        rarity: "LEGENDARY",
        address: "Plaza San Miguel",
        openHoursText: "8:00 AM - 9:00 PM",
        rating: 4.8,
        priceMin: 20,
        priceMax: 40,
        averagePrice: 28.00,
        tags: ['Desayuno', 'Tradicional', 'Familiar'],
        amenities: ['WiFi', 'Estacionamiento', 'Pago con Tarjeta']
    },
    {
        name: "La Sopería",
        description: "Sopas contundentes en foodtruck. Sabores caseros variados.",
        lat: -12.0770,
        long: -77.0900,
        category: "Sopas",
        rarity: "RARE",
        address: "Av. Dinthilac con Av. La Marina, San Miguel",
        openHoursText: "Caliente las 24h",
        rating: 4.5,
        priceMin: 10,
        priceMax: 20,
        averagePrice: 15.00,
        tags: ['Casero', 'Al paso', '24 Horas'],
        amenities: ['Yape/Plin']
    },
    {
        name: "Manos Criollas",
        description: "Comida criolla al peso. Bueno, bonito y barato.",
        lat: -12.0805,
        long: -77.0935,
        category: "Criollo",
        rarity: "COMMON",
        address: "Frente al Shopping Center San Miguel",
        openHoursText: "12:00 PM - 4:00 PM",
        rating: 4.2,
        priceMin: 15,
        priceMax: 25,
        averagePrice: 20.00,
        tags: ['Casero', 'Menú', 'Barato'],
        amenities: ['Yape/Plin']
    },
    {
        name: "Chifa My Home",
        description: "Buffet chifa y al carta. Arroz chaufa excelente.",
        lat: -12.0855,
        long: -77.0880,
        category: "Chifa",
        rarity: "RARE",
        address: "Av. La Marina, San Miguel",
        openHoursText: "12:00 PM - 10:00 PM",
        rating: 4.4,
        priceMin: 25,
        priceMax: 50,
        averagePrice: 35.00,
        tags: ['Familiar', 'Tradicional'],
        amenities: ['WiFi', 'Pago con Tarjeta']
    },
    {
        name: "Pica Pollo",
        description: "Pollo crispy y criollo. Sabor peruano intenso.",
        lat: -12.0795,
        long: -77.0890,
        category: "Pollo",
        rarity: "COMMON",
        address: "San Miguel, Zona Comercial",
        openHoursText: "11:00 AM - 10:00 PM",
        rating: 4.3,
        priceMin: 18,
        priceMax: 30,
        averagePrice: 22.00,
        tags: ['Al paso', 'Barato'],
        amenities: ['Yape/Plin']
    },
    {
        name: "Kio",
        description: "Famoso por sus chicharrones y desayunos.",
        lat: -12.0840,
        long: -77.0870,
        category: "Sanguchería",
        rarity: "LEGENDARY",
        address: "Av. Universitaria, San Miguel",
        openHoursText: "7:00 AM - 10:00 PM",
        rating: 4.7,
        priceMin: 25,
        priceMax: 45,
        averagePrice: 30.00,
        tags: ['Desayuno', 'Familiar'],
        amenities: ['Estacionamiento', 'Pago con Tarjeta']
    },
    {
        name: "Rústica San Miguel",
        description: "Buffet criollo y show. Para ir en grupo.",
        lat: -12.0890,
        long: -77.0955,
        category: "Buffet",
        rarity: "COMMON",
        address: "Av. La Marina",
        district: "San Miguel",
        openHoursText: "12:00 PM - 11:00 PM",
        rating: 4.1,
        priceMin: 50,
        priceMax: 80,
        averagePrice: 60.00,
        tags: ['Familiar', 'Tradicional'],
        amenities: ['Estacionamiento', 'Bar', 'Pago con Tarjeta']
    },
    // --- SYNTHETIC FILLERS (To reach ~50) ---
    { name: "Menú Casero Mamá Tere", category: "Criollo", rarity: "COMMON", price: 12.00, tags: ['Casero', 'Barato'], amenities: ['Yape/Plin'] },
    { name: "Sanguchería El Gordo", category: "Sanguchería", rarity: "COMMON", price: 18.00, tags: ['Tradicional'], amenities: ['Yape/Plin'] },
    { name: "Cevichería El Puerto", category: "Marino", rarity: "COMMON", price: 30.00, tags: ['Tradicional'], amenities: ['Terraza'] },
    { name: "Chifa Dragón Rojo", category: "Chifa", rarity: "COMMON", price: 25.00, tags: ['Barato'], amenities: ['Yape/Plin'] },
    { name: "Pollería El Pollón", category: "Pollo a la Brasa", rarity: "COMMON", price: 35.00, tags: ['Familiar'], amenities: ['Estacionamiento'] },
    { name: "Juguería La Frescura", category: "Postres", rarity: "COMMON", price: 10.00, tags: ['Desayuno'], amenities: ['WiFi'] },
    { name: "Anticuchos La Tía Veneno", category: "Carretilla", rarity: "EPIC", price: 15.00, tags: ['Al paso'], amenities: ['Yape/Plin'] },
    { name: "Salchipapas El Paso", category: "Comida Rápida", rarity: "COMMON", price: 15.00, tags: ['Barato'], amenities: ['Yape/Plin'] },
    { name: "Pizza House", category: "Italiana", rarity: "COMMON", price: 30.00, tags: ['Familiar'], amenities: ['Delivery'] },
    { name: "Sushi Bar Express", category: "Japonesa", rarity: "RARE", price: 40.00, tags: ['Gourmet'], amenities: ['WiFi'] },
    { name: "Café de la Esquina", category: "Café", rarity: "COMMON", price: 12.00, tags: ['Desayuno'], amenities: ['WiFi'] },
    { name: "Restaurante Norteño El Chelo", category: "Criollo", rarity: "RARE", price: 35.00, tags: ['Tradicional'], amenities: ['Yape/Plin'] },
    { name: "Pescados y Mariscos Don Lucho", category: "Marino", rarity: "COMMON", price: 28.00, tags: ['Familiar'], amenities: ['Yape/Plin'] },
    { name: "Chifa Wa Lok (Express)", category: "Chifa", rarity: "COMMON", price: 22.00, tags: ['Barato'], amenities: ['Yape/Plin'] },
    { name: "Brostería El Crujiente", category: "Pollo", rarity: "COMMON", price: 18.00, tags: ['Barato'], amenities: ['Yape/Plin'] },
    { name: "Tamales de la Abuela", category: "Carretilla", rarity: "EPIC", price: 8.00, tags: ['Tradicional'], amenities: ['Yape/Plin'] },
    { name: "Dulces Limeños", category: "Postres", rarity: "RARE", price: 10.00, tags: ['Casero'], amenities: ['Yape/Plin'] },
    { name: "Fuente de Soda San Miguel", category: "Comida Rápida", rarity: "COMMON", price: 20.00, tags: ['Familiar'], amenities: ['Yape/Plin'] },
    { name: "Market Wuarike", category: "Criollo", rarity: "COMMON", price: 15.00, tags: ['Menu'], amenities: ['Yape/Plin'] },
    { name: "La Punta del Sabor", category: "Marino", rarity: "RARE", price: 32.00, tags: ['Familiar'], amenities: ['Yape/Plin'] },
    { name: "Tacos y Burritos", category: "Mexicana", rarity: "COMMON", price: 22.00, tags: ['Al paso'], amenities: ['Yape/Plin'] },
    { name: "Hamburguesas del Barrio", category: "Sanguchería", rarity: "COMMON", price: 20.00, tags: ['Casero'], amenities: ['Yape/Plin'] },
];

const seed = async () => {
    try {
        await AppDataSource.initialize();
        console.log('📦 Connected to PostgreSQL Seed...');
        console.log('🔄 Synchronizing schema...');
        await AppDataSource.synchronize();
        console.log('✅ Schema synchronized.');

        const userRepo = AppDataSource.getRepository(User);
        const placeRepo = AppDataSource.getRepository(Place);
        const tagRepo = AppDataSource.getRepository(Tag);
        const amenityRepo = AppDataSource.getRepository(Amenity);

        // 0. Create Tags & Amenities
        console.log('🏷️ Creating Tags & Amenities...');
        for (const t of commonTags) {
            const exists = await tagRepo.findOne({ where: { slug: t.slug } });
            if (!exists) await tagRepo.save(tagRepo.create(t));
        }
        for (const a of commonAmenities) {
            const exists = await amenityRepo.findOne({ where: { slug: a.slug } });
            if (!exists) await amenityRepo.save(amenityRepo.create(a));
        }

        const allTags = await tagRepo.find();
        const allAmenities = await amenityRepo.find();
        const getTags = (names: string[] = []) => allTags.filter(t => names.includes(t.name));
        const getAmenities = (names: string[] = []) => allAmenities.filter(a => names.includes(a.name));

        // 1. Create Users
        console.log('👤 Creating Users...');
        const existingAdmin = await userRepo.findOne({ where: { email: 'admin@wuarike.com' } });
        if (!existingAdmin) {
            const password = await bcrypt.hash('123456', 10);
            const admin = userRepo.create({
                email: 'admin@wuarike.com',
                passwordHash: password,
                fullName: 'Admin Wuarike',
                role: 'admin',
                currentLevel: 10,
                totalPoints: 5000,
                isVerified: true
            });
            await userRepo.save(admin);
            console.log('✅ Users created.');
        } else {
            existingAdmin.isVerified = true;
            await userRepo.save(existingAdmin);
            console.log('⚠️ Users already exist (Verified status updated).');
        }

        const categoryRepo = AppDataSource.getRepository(Category);
        const ubigeoRepo = AppDataSource.getRepository(Ubigeo);

        // 1.5 Create Categories
        console.log('📂 Creating Categories...');
        const uniqueCategories = [...new Set(sanMiguelWuarikes.map((p: any) => p.category))];
        const categoryMap = new Map<string, Category>();

        for (const catName of uniqueCategories) {
            let category = await categoryRepo.findOne({ where: { name: catName } });
            if (!category) {
                category = categoryRepo.create({
                    name: catName,
                    slug: catName.toLowerCase().replace(/ /g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                });
                await categoryRepo.save(category);
            }
            categoryMap.set(catName, category);
        }

        // 1.6 Ensure San Miguel Ubigeo exists
        let sanMiguelUbigeo = await ubigeoRepo.findOne({ where: { district: 'San Miguel' } });
        if (!sanMiguelUbigeo) {
            sanMiguelUbigeo = ubigeoRepo.create({
                department: 'Lima',
                province: 'Lima',
                district: 'San Miguel',
                ubigeoCode: '150136',
                latitude: -12.0833,
                longitude: -77.0833
            });
            await ubigeoRepo.save(sanMiguelUbigeo);
        }

        // 2. Create Places (Real + Synthetic)
        console.log('📍 Creating Places in San Miguel...');

        const rarityMap: Record<string, 'COMÚN' | 'RARO' | 'ÉPICO' | 'LEGENDARIO'> = {
            'COMMON': 'COMÚN',
            'RARE': 'RARO',
            'EPIC': 'ÉPICO',
            'LEGENDARY': 'LEGENDARIO'
        };

        const BASE_LAT = -12.0833;
        const BASE_LON = -77.0833;

        for (const p of sanMiguelWuarikes) {
            const existingPlace = await placeRepo.findOne({ where: { name: p.name } });
            if (!existingPlace) {
                let lat = (p as any).lat;
                let lon = (p as any).long;
                if (!lat || !lon) {
                    lat = BASE_LAT + (Math.random() - 0.5) * 0.02;
                    lon = BASE_LON + (Math.random() - 0.5) * 0.02;
                }

                const relatedTags = getTags((p as any).tags);
                const relatedAmenities = getAmenities((p as any).amenities);
                const category = categoryMap.get(p.category);

                // Resolve District (Ubigeo)
                const districtName = (p as any).district || 'San Miguel';
                let ubigeo = await ubigeoRepo.findOne({ where: { district: districtName } });

                // Fallback if not found (should be created in step 1.6 ideally, or just use San Miguel default)
                if (!ubigeo) {
                    ubigeo = sanMiguelUbigeo;
                }

                const place = placeRepo.create({
                    name: p.name,
                    nameNormalized: p.name.toLowerCase().trim(),
                    description: (p as any).description || `${p.category || 'Lugar'} en ${districtName}.`,
                    category: category,
                    district: ubigeo,
                    averagePrice: (p as any).averagePrice || (p as any).price || 20,
                    priceMin: (p as any).priceMin || ((p as any).price || 20) - 5,
                    priceMax: (p as any).priceMax || ((p as any).price || 20) + 10,
                    openHoursText: (p as any).openHoursText || (p as any).openHours || '12:00 PM - 10:00 PM',
                    rarity: rarityMap[(p as any).rarity] || 'COMÚN',
                    address: (p as any).address || 'San Miguel',
                    isVerified: (p as any).isVerified || false,
                    verifiedAt: (p as any).verifiedAt || null,
                    latitude: lat,
                    longitude: lon,
                    status: 'active',
                    location: {
                        type: 'Point',
                        coordinates: [lon, lat],
                    },
                    tags: relatedTags,
                    amenities: relatedAmenities
                });
                await placeRepo.save(place);
            }
        }
        console.log('✅ Places processed.');

        console.log('✅ Seeding Complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
};

seed();
