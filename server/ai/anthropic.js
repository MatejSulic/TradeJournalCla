const { AiError, normalizeError, assertNonEmpty } = require('./errors');

function create({ apiKey, model }) {
  return {
    id: 'anthropic',
    model,
    async stream({ system, context, messages, signal, onText }) {
      if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new (Anthropic.default || Anthropic)({ apiKey });
      let text = '';
      let stopReason = null;
      try {
        const stream = client.messages.stream(
          {
            model,
            max_tokens: 4096,
            system: [
              { type: 'text', text: system },
              { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
            ],
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          },
          { signal },
        );
        stream.on('text', (t) => { text += t; if (onText) onText(t); });
        const final = await stream.finalMessage();
        stopReason = final && final.stop_reason;
      } catch (err) {
        throw normalizeError(err, signal);
      }
      assertNonEmpty(text, stopReason && 'stop_reason: ' + stopReason, 'Claude');
      return { text };
    },
  };
}

module.exports = { create };
