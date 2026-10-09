/**
 * El canal de Facebook (Meta) vive detrás de un flag por local: place.metadata.whatsappMetaEnabled.
 * Sin el flag, todo sigue exactamente por el flujo anterior (PlazBot).
 */
export const isMetaEnabled = (place?: { metadata?: any } | null): boolean => place?.metadata?.whatsappMetaEnabled === true;
