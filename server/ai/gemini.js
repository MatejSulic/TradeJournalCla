const { AiError, normalizeError } = require('./errors');

function create({ apiKey, model }) {
  return {
    id: 'gemini',
    model,
    async stream({ system, context, messages, signal, onText }) {
      if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      let text = '';
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction: system + '\n\n' + context, abortSignal: signal },
        });
        for await (const chunk of stream) {
          if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
          const t = chunk.text;
          if (t) { text += t; if (onText) onText(t); }
        }
      } catch (err) {
        throw normalizeError(err, signal);
      }
      return { text };
    },
  };
}

module.exports = { create };
