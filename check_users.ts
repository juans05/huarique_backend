
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { User } from './src/modules/users/entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo = app.get<Repository<User>>(getRepositoryToken(User));
  
  const users = await repo.find();
  
  console.log('--- USERS ---');
  users.forEach(u => {
    console.log(`Email: ${u.email} | Role: ${u.role}`);
  });
  
  await app.close();
}
bootstrap();
