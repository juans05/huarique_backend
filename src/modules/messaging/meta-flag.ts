/**
 * Canal de WhatsApp (Facebook) del local: activo por defecto; apagado solo si alguien lo desactivó
 * en el panel (place.metadata.whatsappMetaEnabled === false). Apagado = el local no envía ni responde.
 */
export const isMetaEnabled = (place?: { metadata?: any } | null): boolean => place?.metadata?.whatsappMetaEnabled !== false;
