import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { UbigeoService } from './ubigeo.service';

@ApiTags('ubigeo')
@Controller('ubigeo')
export class UbigeoController {
    constructor(private readonly ubigeoService: UbigeoService) { }

    @Get('departments')
    @ApiOperation({ summary: 'List all departments' })
    @ApiResponse({ status: 200, description: 'Array of department names.' })
    async getDepartments() {
        return this.ubigeoService.getDepartments();
    }

    @Get('provinces')
    @ApiOperation({ summary: 'List provinces by department' })
    @ApiQuery({ name: 'department', required: true })
    @ApiResponse({ status: 200, description: 'Array of province names.' })
    async getProvinces(@Query('department') department: string) {
        return this.ubigeoService.getProvinces(department);
    }

    @Get('districts')
    @ApiOperation({ summary: 'List districts by province' })
    @ApiQuery({ name: 'department', required: true })
    @ApiQuery({ name: 'province', required: true })
    @ApiResponse({ status: 200, description: 'Array of district objects with ubigeo data.' })
    async getDistricts(
        @Query('department') department: string,
        @Query('province') province: string
    ) {
        return this.ubigeoService.getDistricts(department, province);
    }
}
