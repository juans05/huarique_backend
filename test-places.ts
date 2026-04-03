
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PlacesService } from './src/modules/places/places.service';
import { GetPlacesDto } from './src/modules/places/dto/get-places.dto';
import { config } from 'dotenv';

async function test() {
    config();
    const app = await NestFactory.createApplicationContext(AppModule);
    const placesService = app.get(PlacesService);

    console.log('--- Testing /places with limit and coordinates ---');
    
    // Simulate query parameters from the failed request
    const query = new GetPlacesDto();
    query.latitude = -12.0795381;
    query.longitude = -77.1003871;
    query.page = 1;
    (query as any).limit = 20; // Type casting as it's an optional alias
    
    try {
        const result = await placesService.findAll(query);
        console.log('✅ Success! Found places:', result.data.length);
        console.log('First place name:', result.data[0]?.name || 'No places found');
        console.log('Pagination info:', JSON.stringify(result.meta));
    } catch (error) {
        console.error('❌ Error testing places:', error);
    }

    await app.close();
}

test();
