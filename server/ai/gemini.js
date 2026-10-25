const { AiError, normalizeError, assertNonEmpty } = require('./errors');

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
      let reason = null;
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction: system + '\n\n' + context, abortSignal: signal },
        });
        for await (const chunk of stream) {
          if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
          const block = chunk.promptFeedback && chunk.promptFeedback.blockReason;
          const fin = chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason;
          if (block) reason = 'prompt blocked: ' + block;
          else if (fin && fin !== 'STOP') reason = fin;
          const t = chunk.text;
          if (t) { text += t; if (onText) onText(t); }
        }
      } catch (err) {
        throw normalizeError(err, signal);
      }
      assertNonEmpty(text, reason, 'Gemini (blocked by safety filters?)');
      return { text };
    },
  };
}

module.exports = { create };
