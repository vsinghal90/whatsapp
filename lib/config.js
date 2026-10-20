// All settings come from environment variables. Nothing secret lives in the repo.

const DEFAULT_MENU_SHEET_ID = '1QXJNRLOuIlhww9tM2DerlbY8zYK8ITmHw21piEelAFg';

export function getConfig(env = process.env) {
  return {
    graphVersion: env.WHATSAPP_GRAPH_VERSION || 'v23.0',
    accessToken: env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    ownerNumber: env.OWNER_WHATSAPP_NUMBER || '',
    businessName: env.BUSINESS_NAME || 'Shuddh Desi Bites',
    menuSheetId: env.MENU_SHEET_ID || DEFAULT_MENU_SHEET_ID,
    // gid of the zomato_menu_items tab
    menuSheetGid: env.MENU_SHEET_GID || '0',
    menuCsvUrl: env.MENU_CSV_URL || '',
    menuCacheSeconds: Number(env.MENU_CACHE_SECONDS || 600),
    humanHandoffMinutes: Number(env.HUMAN_HANDOFF_MINUTES || 120),
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    claudeModel: env.CLAUDE_MODEL || 'claude-opus-5-5',
    redisUrl: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '',
    redisToken: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '',
  };
}

export function missingWhatsAppSettings(config) {
  const required = {
    WHATSAPP_ACCESS_TOKEN: config.accessToken,
    WHATSAPP_PHONE_NUMBER_ID: config.phoneNumberId,
    WHATSAPP_APP_SECRET: config.appSecret,
    WHATSAPP_VERIFY_TOKEN: config.verifyToken,
  };
  return Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
}
