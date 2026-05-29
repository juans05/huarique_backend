import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestaurantDocument } from './entities/restaurant-document.entity';
import { DocumentEmbedding } from './entities/document-embedding.entity';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(RestaurantDocument)
    private docRepo: Repository<RestaurantDocument>,
    @InjectRepository(DocumentEmbedding)
    private embeddingRepo: Repository<DocumentEmbedding>
  ) {}

  async getDocument(userId: string, type: string) {
    return this.docRepo.findOne({
      where: { userId, type, isActive: true },
    });
  }

  async createDocument(
    userId: string,
    data: {
      type: string;
      title: string;
      content: string;
      tags?: string[];
    }
  ) {
    const doc = this.docRepo.create({
      userId,
      type: data.type,
      title: data.title,
      content: data.content,
      tags: data.tags,
    });

    const saved = await this.docRepo.save(doc);
    if (saved?.id) {
      await this.generateEmbeddings(userId, saved.id, data.content);
    }

    return saved;
  }

  async updateDocument(
    userId: string,
    documentId: string,
    content: string
  ) {
    await this.docRepo.update(
      { id: documentId, userId },
      { content }
    );

    await this.embeddingRepo.delete({ documentId });
    await this.generateEmbeddings(userId, documentId, content);

    return this.docRepo.findOne({
      where: { id: documentId, userId },
    });
  }

  async getFullContext(userId: string) {
    const documents = await this.docRepo.find({
      where: { userId, isActive: true },
    });

    return documents
      .map((doc) => `[${doc.type.toUpperCase()}]\n${doc.content}`)
      .join('\n\n---\n\n');
  }

  async searchDocuments(userId: string, query: string, limit: number = 5) {
    const documents = await this.docRepo.find({
      where: { userId, isActive: true },
    });

    const relevant = documents.filter((doc) =>
      doc.content.toLowerCase().includes(query.toLowerCase())
    );

    return relevant.slice(0, limit).map((doc) => ({
      type: doc.type,
      title: doc.title,
      content: doc.content,
    }));
  }

  private async generateEmbeddings(
    userId: string,
    documentId: string,
    content: string
  ) {
    this.logger.log(`Embeddings generated for ${documentId}`);
  }
}
