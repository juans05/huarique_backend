import { Controller, Get, Query, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

@Controller('ubigeo')
export class UbigeoRawController implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;

    constructor(private configService: ConfigService) {}

    onModuleInit() {
        const dbHost = this.configService.get('DB_HOST');
        const dbPort = parseInt(this.configService.get('DB_PORT') || '5432');
        const dbUser = this.configService.get('DB_USERNAME');
        const dbPassword = this.configService.get('DB_PASSWORD');
        const dbName = this.configService.get('DB_NAME');

        // Pool initialized below (credentials not logged for security)

        this.pool = new Pool({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            database: dbName,
        });

        console.log('Pool initialized');
    }

    onModuleDestroy() {
        if (this.pool) {
            this.pool.end();
        }
    }

    @Get('departments')
    async getDepartments() {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            console.log('Querying departments from schema:', schema);
            const result = await this.pool.query(
                `SELECT DISTINCT department FROM ${schema}.ubigeos ORDER BY department`
            );
            console.log('Departments result:', result.rows);
            return result.rows.map((r: any) => r.department);
        } catch (error) {
            console.error('Error getDepartments:', error);
            throw error;
        }
    }

    @Get('provinces')
    async getProvinces(@Query('department') department: string) {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            console.log('Querying provinces for department:', department);
            const result = await this.pool.query(
                `SELECT DISTINCT province FROM ${schema}.ubigeos WHERE department = $1 ORDER BY province`,
                [department]
            );
            console.log('Provinces result:', result.rows);
            return result.rows.map((r: any) => r.province);
        } catch (error) {
            console.error('Error getProvinces:', error);
            throw error;
        }
    }

    @Get('districts')
    async getDistricts(
        @Query('department') department: string,
        @Query('province') province: string
    ) {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            console.log('Querying districts for:', { department, province });
            const result = await this.pool.query(
                `SELECT id, district, ubigeo_code as "ubigeoCode", latitude, longitude FROM ${schema}.ubigeos
                 WHERE department = $1 AND province = $2 ORDER BY district`,
                [department, province]
            );
            console.log('Districts result:', result.rows);
            return result.rows;
        } catch (error) {
            console.error('Error getDistricts:', error);
            throw error;
        }
    }

    @Get('spain/communities')
    async getSpainCommunities() {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            const result = await this.pool.query(
                `SELECT DISTINCT community FROM ${schema}.spain_locations ORDER BY community`
            );
            return result.rows.map((r: any) => r.community);
        } catch (error) {
            console.error('Error getSpainCommunities:', error);
            throw error;
        }
    }

    @Get('spain/provinces')
    async getSpainProvinces(@Query('community') community: string) {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            const result = await this.pool.query(
                `SELECT DISTINCT province FROM ${schema}.spain_locations WHERE community = $1 ORDER BY province`,
                [community]
            );
            return result.rows.map((r: any) => r.province);
        } catch (error) {
            console.error('Error getSpainProvinces:', error);
            throw error;
        }
    }

    @Get('spain/municipalities')
    async getSpainMunicipalities(
        @Query('community') community: string,
        @Query('province') province: string
    ) {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            const result = await this.pool.query(
                `SELECT DISTINCT municipality FROM ${schema}.spain_locations WHERE community = $1 AND province = $2 ORDER BY municipality`,
                [community, province]
            );
            return result.rows.map((r: any) => r.municipality);
        } catch (error) {
            console.error('Error getSpainMunicipalities:', error);
            throw error;
        }
    }

    @Get('nearest')
    async getNearestUbigeo(
        @Query('lat') lat: string,
        @Query('lng') lng: string
    ) {
        try {
            const schema = this.configService.get('DB_SCHEMA') || 'wuarike_db';
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lng);
            console.log('Querying nearest ubigeo for:', { latitude, longitude });

            const result = await this.pool.query(
                `SELECT id, district, department, province, ubigeo_code as "ubigeoCode", latitude, longitude,
                        SQRT(POWER(latitude - $1, 2) + POWER(longitude - $2, 2)) as distance
                 FROM ${schema}.ubigeos
                 ORDER BY distance ASC
                 LIMIT 1`,
                [latitude, longitude]
            );

            console.log('Nearest ubigeo result:', result.rows[0]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getNearestUbigeo:', error);
            throw error;
        }
    }
}
