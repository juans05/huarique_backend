import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Place } from './entities/place.entity';
import { Dish } from './entities/dish.entity';
import { Professional } from '../appointments/entities/professional.entity';
import { User } from '../users/entities/user.entity';
import { CreateIndependentDto } from './dto/create-independent.dto';

/** 3 a 30 caracteres: letras, números, punto y guion bajo; sin punto al inicio ni al final. */
export const NICKNAME_RE = /^(?!\.)[a-z0-9._]{3,30}(?<!\.)$/;

export const normalizeNickname = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase();

/**
 * Barbero independiente: por dentro es un local de una sola persona (barbería, `metadata.independent`), con él
 * como único profesional. El nickname vive en `places.slug`, que la base ya obliga a ser único.
 */
@Injectable()
export class IndependentOnboardingService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(Place) private readonly placesRepo: Repository<Place>,
    ) {}

    async create(userId: string, dto: CreateIndependentDto) {
        const nickname = normalizeNickname(dto.nickname);
        if (!NICKNAME_RE.test(nickname)) {
            throw new BadRequestException('El nickname debe tener de 3 a 30 letras, números, punto o guion bajo');
        }
        const name = dto.displayName.trim();
        try {
            return await this.dataSource.transaction(async (manager) => {
                const place = await manager.save(Place, manager.create(Place, {
                    name,
                    slug: nickname,
                    address: '',
                    businessType: 'barberia',
                    claimedByUserId: userId,
                    status: 'pending',
                    metadata: { independent: true, serviceModes: dto.serviceModes, ...(dto.zone?.trim() ? { zone: dto.zone.trim() } : {}) },
                }));
                const pro = await manager.save(Professional, manager.create(Professional, {
                    placeId: place.id,
                    name,
                    photoUrl: dto.photoUrl ?? null,
                    teamUserId: userId,
                    active: true,
                    serviceIds: [],
                    daysOff: [],
                    displayOrder: 0,
                }));
                // Un barbero que se registró solo queda como 'user' y el panel web no lo deja entrar: pasa a dueño
                // de negocio. Solo se sube desde 'user'; un admin o comercial conserva su rol.
                await manager.update(User, { id: userId, role: 'user' }, { role: 'business' });
                for (const [i, s] of dto.services.entries()) {
                    await manager.save(Dish, manager.create(Dish, {
                        placeId: place.id,
                        name: s.name.trim(),
                        price: s.price,
                        durationMin: s.durationMin,
                        kind: 'servicio',
                        isAvailable: true,
                        displayOrder: i,
                    }));
                }
                return { placeId: place.id, professionalId: pro.id, nickname };
            });
        } catch (err) {
            if ((err as { code?: string })?.code === '23505') throw new ConflictException('Ese nickname ya está en uso');
            throw err;
        }
    }

    async checkNickname(raw: string) {
        const nickname = normalizeNickname(raw ?? '');
        if (!NICKNAME_RE.test(nickname)) return { nickname, valid: false, available: false, suggestions: [] as string[] };
        if (!(await this.isTaken(nickname))) return { nickname, valid: true, available: true, suggestions: [] as string[] };

        const base = nickname.slice(0, 22);
        const candidates = [`${base}.barber`, ...Array.from({ length: 6 }, () => `${base}_${Math.floor(10 + Math.random() * 90)}`)];
        const suggestions: string[] = [];
        for (const c of candidates) {
            if (suggestions.length === 3) break;
            if (NICKNAME_RE.test(c) && !suggestions.includes(c) && !(await this.isTaken(c))) suggestions.push(c);
        }
        return { nickname, valid: true, available: false, suggestions };
    }

    private isTaken(slug: string) {
        return this.placesRepo.exists({ where: { slug } });
    }
}
