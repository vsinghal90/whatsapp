// Thin client for the WhatsApp Cloud API: POST /{phone-number-id}/messages.
// Interactive limits come from Meta: up to 3 reply buttons (title <= 20 chars),
// list messages with up to 10 rows in total (row title <= 24, description <= 72).

export function clip(text, max) {
  const s = String(text ?? '').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function createWhatsApp(config, fetchImpl = fetch) {
  async function post(payload) {
    const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`WhatsApp API ${res.status}: ${detail}`);
    }
    return res.json();
  }

  return {
    sendText(to, body) {
      return post({ to, type: 'text', text: { body: clip(body, 4096), preview_url: false } });
    },

    // buttons: [{ id, title }], max 3
    sendButtons(to, body, buttons) {
      return post({
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: clip(body, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: clip(b.title, 20) },
            })),
          },
        },
      });
    },

    // rows: [{ id, title, description? }], max 10
    sendList(to, body, buttonLabel, sectionTitle, rows) {
      return post({
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: clip(body, 1024) },
          action: {
            button: clip(buttonLabel, 20),
            sections: [
              {
                title: clip(sectionTitle, 24),
                rows: rows.slice(0, 10).map((r) => ({
                  id: r.id,
                  title: clip(r.title, 24),
                  ...(r.description ? { description: clip(r.description, 72) } : {}),
                })),
              },
            ],
          },
        },
      });
    },

    markRead(messageId) {
      return post({ status: 'read', message_id: messageId });
    },
  };
}
