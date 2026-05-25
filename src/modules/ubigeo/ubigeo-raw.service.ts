import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class UbigeoRawService {
    constructor(private readonly dataSource: DataSource) { }

    async getDepartments(): Promise<string[]> {
        try {
            const result = await this.dataSource.query(
                `SELECT DISTINCT department FROM wuarike_db.ubigeos ORDER BY department`
            );
            return result.map((r: any) => r.department);
        } catch (error) {
            console.error('Error en getDepartments:', error);
            throw error;
        }
    }

    async getProvinces(department: string): Promise<string[]> {
        try {
            console.log('department', department);

            const result = await this.dataSource.query(
                `SELECT DISTINCT province 
                FROM wuarike_db.ubigeos 
                WHERE department = $1 
                ORDER BY province`,
                [department]
            );

            return [
                'Seleccionar',
                ...result.map((r: any) => r.province)
            ];

        } catch (error) {
            console.error('Error en getProvinces:', error);
            throw error;
        }
    }

    async getDistricts(department: string, province: string): Promise<any[]> {
        try {
            console.log('department', department);
            console.log('province', province);
            const result = await this.dataSource.query(
                `SELECT id, district, ubigeo_code as "ubigeoCode", latitude, longitude FROM wuarike_db.ubigeos
                 WHERE department = $1 AND province = $2 ORDER BY district`,
                [department, province]
            );
            return [
                'Seleccionar',
                ...result.map((r: any) => r.province)
            ];


        } catch (error) {
            console.error('Error en getDistricts:', error);
            throw error;
        }
    }
}
