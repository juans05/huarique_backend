
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlaceSubmission } from './src/modules/places/entities/place-submission.entity';
import { Repository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo = app.get<Repository<PlaceSubmission>>(getRepositoryToken(PlaceSubmission));
  
  const submissions = await repo.find({
    order: { createdAt: 'DESC' },
    take: 5,
    relations: ['submittedBy']
  });
  
  console.log('--- LATEST SUBMISSIONS ---');
  submissions.forEach(s => {
    console.log(`ID: ${s.id} | Name: ${s.name} | Status: ${s.status} | CreatedAt: ${s.createdAt} | User: ${s.submittedBy?.email || 'N/A'}`);
  });
  
  await app.close();
}
bootstrap();
