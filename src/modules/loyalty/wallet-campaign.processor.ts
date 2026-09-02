import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WalletService } from './wallet.service';

@Processor('wallet-campaign')
export class WalletCampaignProcessor extends WorkerHost {
  constructor(private walletService: WalletService) {
    super();
  }

  async process(job: Job<{ cardId: string; header: string; body: string }>): Promise<any> {
    const { cardId, header, body } = job.data;
    try {
      await this.walletService.sendLoyaltyMessage(cardId, header, body);
      return { success: true, cardId };
    } catch (error) {
      console.error(`[Wallet Campaign FAILED] card ${cardId}:`, error);
      throw error;
    }
  }
}
