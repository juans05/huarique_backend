/**
 * Facebook (Meta) es el canal por defecto. Un local solo vuelve a PlazBot (legado) si alguien
 * apagó explícitamente el canal: place.metadata.whatsappMetaEnabled === false.
 */
export const isMetaEnabled = (place?: { metadata?: any } | null): boolean => place?.metadata?.whatsappMetaEnabled !== false;
