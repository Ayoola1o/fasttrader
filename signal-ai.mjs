export function signalProvider(env) {
  if (env.GEMINI_API_KEY?.trim()) {
    return { name: 'Gemini', key: env.GEMINI_API_KEY.trim(), model: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash' };
  }
  if (env.OPENAI_API_KEY?.trim()) {
    return { name: 'OpenAI', key: env.OPENAI_API_KEY.trim(), model: env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini' };
  }
  return null;
}

export async function assessSignal(provider, symbol, side, bars, request = fetch) {
  if (!provider) throw Error('AI provider is unconfigured');
  const instruction = 'Analyze the minute closes and proposed direction. Return JSON with side (buy, sell, or hold) and rationale (one sentence). Use hold if the proposed direction lacks support.';
  const input = JSON.stringify({ symbol, proposedSide: side, closes: bars.slice(-20).map(bar => bar.c) });
  const gemini = provider.name === 'Gemini';
  const headers = { 'Content-Type': 'application/json' };
  let url, body;
  if (gemini) {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(provider.model.replace(/^models\//, '')) + ':generateContent';
    headers['x-goog-api-key'] = provider.key;
    body = {
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: {
        type: 'OBJECT', required: ['side', 'rationale'],
        properties: { side: { type: 'STRING', enum: ['buy', 'sell', 'hold'] }, rationale: { type: 'STRING' } }
      } }
    };
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = 'Bearer ' + provider.key;
    body = { model: provider.model, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: instruction }, { role: 'user', content: input }
    ] };
  }

  let response;
  try {
    response = await request(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  } catch {
    throw Error('AI provider unavailable');
  }
  if (!response.ok) throw Error('AI provider unavailable (' + response.status + ')');

  try {
    const result = await response.json();
    const candidate = result.candidates?.[0];
    const reply = gemini
      ? candidate?.finishReason === 'STOP' && candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('')
      : result.choices?.[0]?.message?.content;
    const output = JSON.parse(reply);
    if (!['buy', 'sell', 'hold'].includes(output?.side) || typeof output.rationale !== 'string' || !output.rationale.trim()) throw Error();
    return { side: output.side, rationale: output.rationale.trim().slice(0, 400) };
  } catch {
    throw Error('Invalid AI response');
  }
}
