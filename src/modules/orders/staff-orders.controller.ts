import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { OrderSettingsService } from './order-settings.service';
import { PaymentsService } from './payments.service';
import { CashService } from './cash.service';
import { ChargeDto, CloseCashDto, OpenCashDto, PrecuentaDto } from './dto/cash.dto';
import { ChangeStatusDto, ManualPaymentDto } from './dto/orders.dto';
import { TableDto, UpdateOrderSettingsDto, UpdateTableDto } from './dto/order-settings.dto';
import { OrderChannel, OrderStatus } from './entities/order.entity';

@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/orders')
export class StaffOrdersController {
    constructor(private orders: OrdersService, private settings: OrderSettingsService, private payments: PaymentsService, private cash: CashService) { }

    @Get('me')
    @RequiresPlaceRole('cocina')
    me(@Req() req: any) {
        return { role: req.placeTeamMember.role };
    }

    @Get()
    @RequiresPlaceRole('agente')
    list(@Param('placeId') placeId: string, @Query('status') status?: string, @Query('channel') channel?: OrderChannel, @Query('q') q?: string, @Query('page') page = '1') {
        return this.orders.listForPlace(placeId, { status: status ? (status.split(',') as OrderStatus[]) : undefined, channel, q, page: parseInt(page, 10) || 1 });
    }

    @Get('kds')
    @RequiresPlaceRole('cocina')
    kds(@Param('placeId') placeId: string) {
        return this.orders.listActiveForKds(placeId);
    }

    @Patch(':orderId/status')
    @RequiresPlaceRole('cocina')
    changeStatus(@Param('placeId') placeId: string, @Param('orderId') orderId: string, @Body() dto: ChangeStatusDto, @Req() req: any) {
        return this.orders.changeStatus(placeId, orderId, dto.status, req.placeTeamMember.role, dto.reason);
    }

    @Get('tables-board')
    @RequiresPlaceRole('agente')
    tablesBoard(@Param('placeId') placeId: string) {
        return this.orders.tablesBoard(placeId);
    }

    @Post('tabs/:tabId/close')
    @RequiresPlaceRole('agente')
    closeTab(@Param('placeId') placeId: string, @Param('tabId') tabId: string) {
        return this.orders.closeTab(placeId, tabId);
    }

    @Post('tabs/:tabId/precuenta')
    @RequiresPlaceRole('agente')
    requestPrecuenta(@Param('placeId') placeId: string, @Param('tabId') tabId: string, @Body() dto: PrecuentaDto) {
        return this.cash.requestPrecuenta(placeId, tabId, dto);
    }

    // ── Caja ────────────────────────────────────────────────────────────
    @Get('cash')
    @RequiresPlaceRole('agente')
    cashCurrent(@Param('placeId') placeId: string) {
        return this.cash.current(placeId);
    }

    @Post('cash/open')
    @RequiresPlaceRole('agente')
    cashOpen(@Param('placeId') placeId: string, @Body() dto: OpenCashDto, @CurrentUser() user: any) {
        return this.cash.open(placeId, user.id, dto.openingAmount);
    }

    @Post('cash/charge')
    @RequiresPlaceRole('agente')
    cashCharge(@Param('placeId') placeId: string, @Body() dto: ChargeDto, @CurrentUser() user: any) {
        return this.cash.charge(placeId, user.id, dto);
    }

    @Post('cash/close')
    @RequiresPlaceRole('agente')
    cashClose(@Param('placeId') placeId: string, @Body() dto: CloseCashDto, @CurrentUser() user: any) {
        return this.cash.close(placeId, user.id, dto.countedCash);
    }

    @Post('payments/manual')
    @RequiresPlaceRole('agente')
    manualPayment(@Param('placeId') placeId: string, @Body() dto: ManualPaymentDto, @CurrentUser() user: any) {
        return this.payments.recordManualPayment(placeId, { tabId: dto.tabId, orderId: dto.orderId }, dto.method, user.id);
    }

    @Get('settings')
    @RequiresPlaceRole('supervisor')
    getSettings(@Param('placeId') placeId: string) {
        return this.settings.getForAdmin(placeId);
    }

    @Patch('settings')
    @RequiresPlaceRole('supervisor')
    updateSettings(@Param('placeId') placeId: string, @Body() dto: UpdateOrderSettingsDto) {
        return this.settings.update(placeId, dto);
    }

    @Post('settings/test-culqi')
    @RequiresPlaceRole('supervisor')
    testCulqi(@Param('placeId') placeId: string) {
        return this.settings.testCulqiKeys(placeId);
    }

    @Get('tables')
    @RequiresPlaceRole('supervisor')
    async tables(@Param('placeId') placeId: string) {
        const tables = await this.settings.listTables(placeId);
        return tables.map((t) => ({ ...t, qrUrl: this.settings.tableQrUrl(t) }));
    }

    @Post('tables')
    @RequiresPlaceRole('supervisor')
    async createTable(@Param('placeId') placeId: string, @Body() dto: TableDto) {
        const table = await this.settings.createTable(placeId, dto);
        return { ...table, qrUrl: this.settings.tableQrUrl(table) };
    }

    @Patch('tables/:tableId')
    @RequiresPlaceRole('supervisor')
    async updateTable(@Param('placeId') placeId: string, @Param('tableId') tableId: string, @Body() dto: UpdateTableDto) {
        const table = await this.settings.updateTable(placeId, tableId, dto);
        return { ...table, qrUrl: this.settings.tableQrUrl(table) };
    }

    @Post('tables/:tableId/regenerate-qr')
    @RequiresPlaceRole('supervisor')
    async regenerateQr(@Param('placeId') placeId: string, @Param('tableId') tableId: string) {
        const table = await this.settings.regenerateQr(placeId, tableId);
        return { ...table, qrUrl: this.settings.tableQrUrl(table) };
    }
}
