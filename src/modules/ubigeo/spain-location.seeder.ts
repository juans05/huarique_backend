import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpainLocation } from './entities/spain-location.entity';

type SpainEntry = { community: string; province: string; municipality: string };

function build(community: string, provinces: Record<string, string[]>): SpainEntry[] {
    const rows: SpainEntry[] = [];
    for (const [province, municipalities] of Object.entries(provinces)) {
        for (const municipality of municipalities) {
            rows.push({ community, province, municipality });
        }
    }
    return rows;
}

const SPAIN_DATA: SpainEntry[] = [
    ...build('Andalucía', {
        'Almería': ['Almería', 'El Ejido', 'Roquetas de Mar', 'Níjar', 'Vícar', 'Adra', 'Vera', 'Huércal-Overa'],
        'Cádiz': ['Cádiz', 'Jerez de la Frontera', 'Algeciras', 'El Puerto de Santa María', 'San Fernando', 'La Línea de la Concepción', 'Chiclana de la Frontera', 'Sanlúcar de Barrameda'],
        'Córdoba': ['Córdoba', 'Lucena', 'Pozoblanco', 'Montilla', 'Puente Genil', 'Palma del Río', 'Cabra', 'Priego de Córdoba'],
        'Granada': ['Granada', 'Motril', 'Almuñécar', 'Maracena', 'Loja', 'Baza', 'Guadix', 'Armilla'],
        'Huelva': ['Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Cartaya', 'Palos de la Frontera'],
        'Jaén': ['Jaén', 'Linares', 'Úbeda', 'Andújar', 'Alcalá la Real', 'Martos', 'Baeza', 'Cazorla'],
        'Málaga': ['Málaga', 'Marbella', 'Vélez-Málaga', 'Torremolinos', 'Benalmádena', 'Fuengirola', 'Mijas', 'Estepona', 'Ronda', 'Nerja'],
        'Sevilla': ['Sevilla', 'Dos Hermanas', 'Alcalá de Guadaíra', 'Utrera', 'Mairena del Aljarafe', 'La Rinconada', 'Écija', 'Marchena'],
    }),
    ...build('Aragón', {
        'Huesca': ['Huesca', 'Monzón', 'Barbastro', 'Fraga', 'Sabiñánigo', 'Jaca', 'Binéfar', 'Graus'],
        'Teruel': ['Teruel', 'Alcañiz', 'Andorra', 'Calamocha', 'Utrillas', 'Mora de Rubielos', 'Monreal del Campo'],
        'Zaragoza': ['Zaragoza', 'Calatayud', 'Utebo', 'Ejea de los Caballeros', 'Tarazona', 'Cuarte de Huerva', 'Caspe', 'La Muela'],
    }),
    ...build('Asturias', {
        'Asturias': ['Oviedo', 'Gijón', 'Avilés', 'Mieres', 'Langreo', 'Siero', 'Castrillón', 'Gozón', 'Llanes', 'Cangas de Onís'],
    }),
    ...build('Baleares', {
        'Baleares': ['Palma', 'Calviá', 'Manacor', 'Llucmajor', 'Ibiza', 'Marratxí', 'Felanitx', 'Inca', 'Mahón', 'Ciutadella de Menorca'],
    }),
    ...build('Canarias', {
        'Las Palmas': ['Las Palmas de Gran Canaria', 'Telde', 'Arrecife', 'Puerto del Rosario', 'Ingenio', 'Agüimes', 'Maspalomas', 'San Bartolomé de Tirajana'],
        'Santa Cruz de Tenerife': ['Santa Cruz de Tenerife', 'San Cristóbal de La Laguna', 'Arona', 'Adeje', 'Puerto de la Cruz', 'La Orotava', 'Güímar', 'Los Realejos'],
    }),
    ...build('Cantabria', {
        'Cantabria': ['Santander', 'Torrelavega', 'Castro-Urdiales', 'Camargo', 'Piélagos', 'Astillero', 'Santoña', 'Laredo', 'Reinosa'],
    }),
    ...build('Castilla-La Mancha', {
        'Albacete': ['Albacete', 'Hellín', 'Villarrobledo', 'Almansa', 'La Roda', 'Chinchilla de Montearagón', 'Caudete'],
        'Ciudad Real': ['Ciudad Real', 'Puertollano', 'Tomelloso', 'Alcázar de San Juan', 'Valdepeñas', 'Manzanares', 'Daimiel', 'Miguelturra'],
        'Cuenca': ['Cuenca', 'Tarancón', 'San Clemente', 'Motilla del Palancar', 'Huete', 'Quintanar del Rey'],
        'Guadalajara': ['Guadalajara', 'Azuqueca de Henares', 'Cabanillas del Campo', 'Alovera', 'Marchamalo', 'Yebes', 'Cogolludo'],
        'Toledo': ['Toledo', 'Talavera de la Reina', 'Illescas', 'Seseña', 'Quintanar de la Orden', 'Torrijos', 'Madridejos'],
    }),
    ...build('Castilla y León', {
        'Ávila': ['Ávila', 'Arévalo', 'Arenas de San Pedro', 'Sotillo de la Adrada', 'Las Navas del Marqués', 'El Tiemblo'],
        'Burgos': ['Burgos', 'Miranda de Ebro', 'Aranda de Duero', 'Medina de Pomar', 'Briviesca', 'Lerma'],
        'León': ['León', 'Ponferrada', 'San Andrés del Rabanedo', 'Villaquilambre', 'Astorga', 'La Bañeza', 'Bembibre'],
        'Palencia': ['Palencia', 'Aguilar de Campoo', 'Guardo', 'Venta de Baños', 'Paredes de Nava', 'Becerril de Campos'],
        'Salamanca': ['Salamanca', 'Béjar', 'Ciudad Rodrigo', 'Santa Marta de Tormes', 'Carbajosa de la Sagrada', 'Peñaranda de Bracamonte'],
        'Segovia': ['Segovia', 'Cuéllar', 'Cantalejo', 'El Espinar', 'San Ildefonso', 'Palazuelos de Eresma'],
        'Soria': ['Soria', 'El Burgo de Osma', 'Almazán', 'Golmayo', 'Ólvega', 'Ágreda'],
        'Valladolid': ['Valladolid', 'Laguna de Duero', 'Medina del Campo', 'Arroyo de la Encomienda', 'Tordesillas', 'Peñafiel'],
        'Zamora': ['Zamora', 'Benavente', 'Toro', 'Puebla de Sanabria', 'Morales del Vino'],
    }),
    ...build('Cataluña', {
        'Barcelona': ['Barcelona', "L'Hospitalet de Llobregat", 'Badalona', 'Terrassa', 'Sabadell', 'Mataró', 'Santa Coloma de Gramenet', 'Cornellà de Llobregat', 'Sant Cugat del Vallès', 'El Prat de Llobregat', 'Granollers', 'Manresa'],
        'Girona': ['Girona', 'Salt', 'Lloret de Mar', 'Blanes', 'Figueres', 'Olot', 'Roses', 'Sant Feliu de Guíxols', 'Palamós'],
        'Lleida': ['Lleida', 'Mollerussa', 'Balaguer', 'Tàrrega', 'Cervera', "La Seu d'Urgell"],
        'Tarragona': ['Tarragona', 'Reus', 'Tortosa', 'Salou', 'Vila-seca', 'El Vendrell', 'Cambrils', 'Valls'],
    }),
    ...build('Extremadura', {
        'Badajoz': ['Badajoz', 'Mérida', 'Don Benito', 'Almendralejo', 'Villanueva de la Serena', 'Zafra', 'Montijo', 'Plasencia'],
        'Cáceres': ['Cáceres', 'Plasencia', 'Navalmoral de la Mata', 'Miajadas', 'Trujillo', 'Jaraíz de la Vera'],
    }),
    ...build('Galicia', {
        'A Coruña': ['A Coruña', 'Santiago de Compostela', 'Ferrol', 'Narón', 'Oleiros', 'Arteixo', 'Cambre', 'Carballo', 'Boiro', 'Ribeira'],
        'Lugo': ['Lugo', 'Monforte de Lemos', 'Viveiro', 'Burela', 'Ribadeo', 'Vilalba', 'Chantada'],
        'Ourense': ['Ourense', 'O Barco de Valdeorras', 'Verín', 'O Carballiño', 'Xinzo de Limia', 'Ribadavia'],
        'Pontevedra': ['Vigo', 'Pontevedra', 'Vilagarcía de Arousa', 'Redondela', 'Sanxenxo', 'Cangas', 'Moaña', 'Marín', 'Bueu'],
    }),
    ...build('La Rioja', {
        'La Rioja': ['Logroño', 'Calahorra', 'Lardero', 'Arnedo', 'Haro', 'Nájera', 'Alfaro', 'Santo Domingo de la Calzada'],
    }),
    ...build('Madrid', {
        'Madrid': ['Madrid', 'Móstoles', 'Alcalá de Henares', 'Fuenlabrada', 'Leganés', 'Getafe', 'Alcorcón', 'Torrejón de Ardoz', 'Parla', 'Alcobendas', 'Las Rozas', 'Pozuelo de Alarcón', 'San Sebastián de los Reyes', 'Majadahonda', 'Coslada', 'Rivas-Vaciamadrid'],
    }),
    ...build('Murcia', {
        'Murcia': ['Murcia', 'Cartagena', 'Lorca', 'Molina de Segura', 'Alcantarilla', 'Cieza', 'Torre Pacheco', 'Águilas', 'Yecla', 'Jumilla'],
    }),
    ...build('Navarra', {
        'Navarra': ['Pamplona', 'Tudela', 'Barañáin', 'Burlada', 'Estella-Lizarra', 'Tafalla', 'Sangüesa', 'Huarte', 'Villava', 'Berriozar'],
    }),
    ...build('País Vasco', {
        'Álava': ['Vitoria-Gasteiz', 'Llodio', 'Amurrio', 'Salvatierra', 'Oyón-Oion', 'Laudio', 'Ayala'],
        'Guipúzcoa': ['San Sebastián', 'Irun', 'Errenteria', 'Eibar', 'Zarautz', 'Hernani', 'Mondragón', 'Tolosa', 'Arrasate'],
        'Vizcaya': ['Bilbao', 'Barakaldo', 'Getxo', 'Basauri', 'Leioa', 'Sestao', 'Santurtzi', 'Portugalete', 'Durango', 'Galdakao'],
    }),
    ...build('Valencia', {
        'Alicante': ['Alicante', 'Elche', 'Torrevieja', 'Orihuela', 'Benidorm', 'Alcoy', 'Villena', 'Callosa de Segura', 'Dénia', 'Petrer'],
        'Castellón': ['Castellón de la Plana', 'Burriana', 'Villarreal', 'Benicarló', 'Vinaròs', 'Onda', 'Almassora', 'Nules'],
        'Valencia': ['Valencia', 'Torrent', 'Gandia', 'Paterna', 'Alzira', 'Sagunto', 'Mislata', 'Burjassot', 'Ontinyent', 'Xàtiva'],
    }),
];

@Injectable()
export class SpainLocationSeeder implements OnModuleInit {
    private readonly logger = new Logger(SpainLocationSeeder.name);

    constructor(
        @InjectRepository(SpainLocation)
        private readonly repo: Repository<SpainLocation>
    ) {}

    async onModuleInit() {
        try {
            const count = await this.repo.count();
            if (count > 0) return;

            const entities = SPAIN_DATA.map(d => this.repo.create(d));
            await this.repo.save(entities, { chunk: 500 });
            this.logger.log(`Inserted ${entities.length} Spain location entries`);
        } catch (err: any) {
            this.logger.warn(`Spain locations seeder skipped: ${err?.message}`);
        }
    }
}
