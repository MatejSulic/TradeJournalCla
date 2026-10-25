const { AiError } = require('./errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function create(env = process.env) {
  return {
    id: 'mock',
    model: 'mock',
    async stream({ context = '', signal, onText }) {
      const m = /#(\d+)/.exec(context);
      const id = m ? m[1] : '0';
      const full = `Mock analysis: trade #${id} lost because …`;
      const third = Math.ceil(full.length / 3);
      const chunks = [full.slice(0, third), full.slice(third, 2 * third), full.slice(2 * third)];
      let text = '';
      for (let i = 0; i < chunks.length; i++) {
        if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
        text += chunks[i];
        if (onText) onText(chunks[i]);
        if (i === 0 && (process.env.MOCK_FAIL === '1' || env.MOCK_FAIL === '1')) {
          throw new AiError('rate_limit', 'Mock rate limit');
        }
        await sleep(20);
      }
      if (signal && signal.aborted) throw new AiError('aborted', 'Request aborted');
      return { text };
    },
  };
}

module.exports = { create };
