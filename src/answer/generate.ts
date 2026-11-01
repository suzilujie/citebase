import { config } from '../config';
import type { ChunkHit } from '../types';

// Generation is deliberately boring: one non-streaming call, numbered context,
// a strict instruction set, low temperature. Everything interesting about
// grounding happens outside the model, in guard.ts.

const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = [
  '你是一个企业内部知识库助手。只能使用用户提供的【资料】回答。',
  '规则：',
  '1. 每句结论后面必须用 [编号] 标注来源，编号对应资料前的方括号数字。',
  '2. 资料中没有的内容一律不写；完全无法回答时，只输出：文档中未提及相关内容。',
  '3. 不要使用资料以外的常识、不要推测、不要引用不存在的编号。',
  '4. 用简体中文回答，2 到 4 句话，直接给结论，不要复述问题。',
].join('\n');

export function buildContext(hits: ChunkHit[]): string {
  return hits
    .map((hit, i) => {
      const where = hit.headingPath ? `·${hit.headingPath}` : `·第 ${hit.page} 页`;
      return `[${i + 1}] (${hit.filename}${where})\n${hit.content}`;
    })
    .join('\n\n');
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function generateAnswer(question: string, hits: ChunkHit[]): Promise<string> {
  const base = config.OPENAI_BASE_URL.replace(/\/$/, '');
  if (!base) throw new Error('OPENAI_BASE_URL 未配置');
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 未配置');

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.OPENAI_CHAT_MODEL,
      temperature: 0.1,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `【资料】\n${buildContext(hits)}\n\n【问题】\n${question}` },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`模型接口返回 ${res.status}：${body.slice(0, 160)}`);
  }

  const json = (await res.json()) as ChatResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error(json.error?.message ?? '模型返回空内容');
  }
  return content.trim();
}
