import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GoogleBusinessService } from './services/google-business.service';

@ApiTags('google-oauth')
@Controller('business/google')
export class GoogleCallbackController {
  constructor(private readonly googleBusiness: GoogleBusinessService) {}

  @Get('callback')
  @ApiOperation({ summary: 'OAuth callback from Google — no JWT required' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`${this.googleBusiness.frontendUrl}/reputacion?error=${encodeURIComponent(error)}`);
    }

    const redirectUrl = await this.googleBusiness.handleCallback(code, state);
    return res.redirect(redirectUrl);
  }
}
