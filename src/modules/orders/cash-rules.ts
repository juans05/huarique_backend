import type { ReceiptDocType } from './entities/receipt.entity';

export type ReceiptCustomer = { customerDocType?: string; customerDocNumber?: string; customerName?: string; customerAddress?: string };

/** Desde este monto (céntimos) la boleta debe identificar al cliente, como pide SUNAT. */
export const BOLETA_ID_THRESHOLD = 70000;

/** Devuelve el mensaje de error, o null si los datos del cliente sirven para ese comprobante. */
export function receiptCustomerError(docType: ReceiptDocType, c: ReceiptCustomer, total: number): string | null {
    const doc = c.customerDocNumber?.trim() ?? '';
    const name = c.customerName?.trim() ?? '';
    if (docType === 'FACTURA') {
        if (c.customerDocType !== 'RUC' || !/^(10|15|17|20)\d{9}$/.test(doc)) return 'La factura necesita un RUC válido de 11 dígitos';
        if (!name) return 'La factura necesita la razón social';
        if (!c.customerAddress?.trim()) return 'La factura necesita la dirección fiscal';
        return null;
    }
    if (docType === 'BOLETA') {
        if (doc) {
            if (c.customerDocType === 'DNI' && !/^\d{8}$/.test(doc)) return 'El DNI tiene 8 dígitos';
            if (c.customerDocType === 'CE' && !/^[A-Z0-9]{8,12}$/i.test(doc)) return 'El carné de extranjería tiene de 8 a 12 caracteres';
        }
        if (total >= BOLETA_ID_THRESHOLD && (!doc || !name)) return 'Una boleta desde S/ 700 necesita el documento y el nombre del cliente';
    }
    return null;
}

/** B001-00000001 */
export function receiptCode(series: string, number: number): string {
    return `${series}-${String(number).padStart(8, '0')}`;
}
