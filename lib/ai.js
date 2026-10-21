import Anthropic from '@anthropic-ai/sdk';
import { menuAsText } from './menu.js';

export const HANDOFF = 'HANDOFF';

export function systemPrompt(config, menu) {
  return `You answer WhatsApp messages for ${config.businessName}, a home-style North Indian food kitchen in GreenField, Bellandur, Bengaluru. Every dish is vegetarian.

Answer questions about the menu, prices, ingredients and what goes well together, using only the menu below. Never invent dishes, prices, offers, delivery times or delivery areas. Reply in the customer's language (English, Hindi or Hinglish) in a warm, short message of at most 3 sentences, with no markdown headings.

Customers place orders by tapping the Menu button, so when someone wants to order, recommend dishes by name and tell them to tap Menu.

Reply with exactly ${HANDOFF} and nothing else when the customer asks for a person, complains about an order, asks about payment, refunds, delivery status, catering or bulk orders, or asks anything the menu can't answer.

Menu (prices in rupees):
${menuAsText(menu)}`;
}

export function createAi(config, client) {
  if (!config.anthropicApiKey && !client) return null;
  const anthropic = client || new Anthropic({ apiKey: config.anthropicApiKey });

  return {
    // history: [{ role: 'user' | 'assistant', content: string }], newest last
    async answer(menu, history) {
      const response = await anthropic.beta.messages.create({
        model: config.claudeModel,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' },
        system: systemPrompt(config, menu),
        messages: history,
      });
      if (response.stop_reason === 'refusal') return HANDOFF;
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return text || HANDOFF;
    },
  };
}
