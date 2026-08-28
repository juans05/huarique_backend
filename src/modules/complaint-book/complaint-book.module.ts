import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplaintBookEntry } from './entities/complaint-book-entry.entity';
import { ComplaintBookService } from './complaint-book.service';
import { ComplaintBookController } from './complaint-book.controller';

@Module({
    imports: [TypeOrmModule.forFeature([ComplaintBookEntry])],
    controllers: [ComplaintBookController],
    providers: [ComplaintBookService],
})
export class ComplaintBookModule { }
