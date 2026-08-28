import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplaintBookEntry } from './entities/complaint-book-entry.entity';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { MailService } from '../../common/services/mail.service';

@Injectable()
export class ComplaintBookService {
    constructor(
        @InjectRepository(ComplaintBookEntry)
        private complaintsRepository: Repository<ComplaintBookEntry>,
        private mailService: MailService,
    ) { }

    async create(dto: CreateComplaintDto) {
        const entry = await this.complaintsRepository.save(
            this.complaintsRepository.create(dto),
        );

        const folio = buildFolio(entry);
        await this.mailService.sendComplaintReceipt(entry.consumerEmail, entry.consumerFullName, folio, entry.type);

        return { folio };
    }
}

export function buildFolio(entry: ComplaintBookEntry): string {
    const year = entry.createdAt.getFullYear();
    const sequence = String(entry.sequenceNumber).padStart(6, '0');
    return `LR-${year}-${sequence}`;
}
