import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class UbigeoRawService {
    constructor(private readonly dataSource: DataSource) { }

    async getDepartments(): Promise<string[]> {
        try {
            const result = await this.dataSource.query(
                `SELECT DISTINCT department FROM ubigeos ORDER BY department`
            );
            return result.map((r: any) => r.department);
        } catch (error) {
            console.error('Error en getDepartments:', error);
            throw error;
        }
    }

    async getProvinces(department: string): Promise<string[]> {
        try {
            const result = await this.dataSource.query(
                `SELECT DISTINCT province FROM ubigeos WHERE department = $1 ORDER BY province`,
                [department]
            );
            return result.map((r: any) => r.province);
        } catch (error) {
            console.error('Error en getProvinces:', error);
            throw error;
        }
    }

    async getDistricts(department: string, province: string): Promise<any[]> {
        try {
            const result = await this.dataSource.query(
                `SELECT id, district, ubigeo_code as "ubigeoCode", latitude, longitude FROM ubigeos
                 WHERE department = $1 AND province = $2 ORDER BY district`,
                [department, province]
            );
            return result;
        } catch (error) {
            console.error('Error en getDistricts:', error);
            throw error;
        }
    }
}
