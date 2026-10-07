import { ERROR, LIMITS, type Message } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { toMessage } from '../chats/types.js';
import * as repo from './repo.js';

export interface SearchResult {
  message: Message;
  chatTitle: string;
  chatType: string;
  senderUsername: string | null;
}

/**
 * The prototype's search box accepts inline filters — `from:kotin`, `in:general`,
 * `has:file` — mixed with free text. They are stripped out here so the remainder
 * goes to full-text search as the user's actual words.
 */
export interface ParsedQuery {
  text: string;
  from?: string;
  has?: string;
}

export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = { text: '' };
  const words: string[] = [];

  for (const token of raw.split(/\s+/)) {
    const [key, ...rest] = token.split(':');
    const value = rest.join(':');

    if (value && key === 'from') parsed.from = value;
    else if (value && key === 'has') parsed.has = value;
    else if (token) words.push(token);
  }

  parsed.text = words.join(' ').trim();
  return parsed;
}

export async function search(
  userId: string,
  raw: string,
  options: { chatId?: string; limit?: number },
): Promise<SearchResult[]> {
  const parsed = parseQuery(raw);

  // Filters alone cannot drive the query: without search terms the index is
  // useless and the result would be "every message you can see".
  if (!parsed.text) {
    throw new AppError(ERROR.VALIDATION, 'Search needs at least one word', 400);
  }

  const fromUserId = parsed.from ? await repo.findUserIdByUsername(parsed.from) : undefined;

  // An unknown username matches nobody — that is a legitimate empty result.
  if (parsed.from && !fromUserId) return [];

  const hits = await repo.searchMessages({
    userId,
    query: parsed.text,
    chatId: options.chatId,
    fromUserId: fromUserId ?? undefined,
    hasAttachment: parsed.has === 'file' || parsed.has === 'attachment',
    limit: Math.min(options.limit ?? LIMITS.pageSize, LIMITS.maxPageSize),
  });

  return hits.map((hit) => ({
    message: toMessage(hit),
    chatTitle: hit.chatTitle,
    chatType: hit.chatType,
    senderUsername: hit.senderUsername,
  }));
}
