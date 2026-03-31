import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ubigeo } from './entities/ubigeo.entity';

@Injectable()
export class UbigeoService {
    constructor(
        @InjectRepository(Ubigeo)
        private ubigeoRepository: Repository<Ubigeo>,
    ) { }

    async getDepartments(): Promise<string[]> {
        const result = await this.ubigeoRepository
            .createQueryBuilder('ubigeo')
            .select('DISTINCT ubigeo.department', 'department')
            .orderBy('ubigeo.department', 'ASC')
            .getRawMany();

        return result.map(r => r.department);
    }

    async getProvinces(department: string): Promise<string[]> {
        const result = await this.ubigeoRepository
            .createQueryBuilder('ubigeo')
            .select('DISTINCT ubigeo.province', 'province')
            .where('ubigeo.department = :department', { department })
            .orderBy('ubigeo.province', 'ASC')
            .getRawMany();

        return result.map(r => r.province);
    }

    async getDistricts(department: string, province: string): Promise<Ubigeo[]> {
        return this.ubigeoRepository.find({
            where: { department, province },
            order: { district: 'ASC' },
            select: ['id', 'district', 'ubigeoCode', 'latitude', 'longitude']
        });
    }
}
