/**
 * Unit tests for MinimalStore (in-memory conversation store)
 *
 * Tests in-memory conversation management,
 * message deduplication, and Turn conversion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MinimalStore } from '../../src/conversations/index.js';

let store: MinimalStore;

beforeEach(() => {
  store = new MinimalStore();
});

describe('MinimalStore', () => {
  describe('getOrCreate', () => {
    it('creates new conversation when none exists', () => {
      const state = store.getOrCreate('conv-1');
      expect(state).toBeDefined();
      expect(state.title).toBe('New Conversation');
      expect(state.messages).toEqual([]);
      expect(state.status).toBe('completed');
    });

    it('returns existing conversation on second call', () => {
      const first = store.getOrCreate('conv-1');
      first.title = 'Modified';
      const second = store.getOrCreate('conv-1');
      expect(second.title).toBe('Modified');
    });
  });

  describe('get / has', () => {
    it('returns undefined for non-existent conversation', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('returns state for existing conversation', () => {
      store.getOrCreate('conv-1');
      expect(store.get('conv-1')).toBeDefined();
    });

    it('has returns true for existing conversation', () => {
      store.getOrCreate('conv-1');
      expect(store.has('conv-1')).toBe(true);
      expect(store.has('nonexistent')).toBe(false);
    });
  });

  describe('appendMessages', () => {
    it('appends messages to empty conversation', () => {
      const added = store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
      ]);
      expect(added).toHaveLength(1);
      expect(added[0].role).toBe('user');
      expect(added[0].content).toBe('Hello');
    });

    it('deduplicates previously stored messages', () => {
      store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
      ]);
      // Send same message again (typical API re-send pattern)
      const added = store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
      ]);
      expect(added).toHaveLength(0);
    });

    it('returns only newly added messages', () => {
      store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
      ]);
      const added = store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'New message' },
      ]);
      expect(added).toHaveLength(2);
      expect(added[0].content).toBe('Hi!');
      expect(added[1].content).toBe('New message');
    });

    it('sets parentId chain correctly', () => {
      const added = store.appendMessages('conv-1', [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Second' },
      ]);
      expect(added[0].parentId).toBeUndefined();
      expect(added[1].parentId).toBe(added[0].id);
    });
  });

  describe('appendAssistantResponse', () => {
    it('appends response and marks conversation completed', () => {
      store.appendMessages('conv-1', [{ role: 'user', content: 'Hi' }]);
      const msg = store.appendAssistantResponse('conv-1', { content: 'Hello there!' });

      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hello there!');
      expect(msg.status).toBe('succeeded');

      const state = store.get('conv-1')!;
      expect(state.status).toBe('completed');
    });

    it('sets parentId to last message', () => {
      const [userMsg] = store.appendMessages('conv-1', [
        { role: 'user', content: 'Hi' },
      ]);
      const assistantMsg = store.appendAssistantResponse('conv-1', { content: 'Hello' });
      expect(assistantMsg.parentId).toBe(userMsg.id);
    });

    it('stores native tool call data in blocks', () => {
      store.appendMessages('conv-1', [{ role: 'user', content: 'Search for news' }]);
      const msg = store.appendAssistantResponse('conv-1', {
        content: 'Here are the results...',
        blocks: [
          { type: 'tool_call', content: '{"name":"web_search","arguments":{"query":"news"}}' },
          { type: 'tool_result', content: '{"results":[]}' },
          { type: 'text', content: 'Here are the results...' },
        ],
      });

      expect(msg.content).toBe('Here are the results...');
      expect(msg.blocks).toHaveLength(3);
      expect(msg.blocks![0].type).toBe('tool_call');
      expect(msg.blocks![1].type).toBe('tool_result');
      expect(msg.blocks![2].type).toBe('text');
    });
  });

  describe('toTurns', () => {
    it('converts messages to Turn[] format', () => {
      store.appendMessages('conv-1', [
        { role: 'user', content: 'Hello' },
      ]);
      store.appendAssistantResponse('conv-1', { content: 'Hi!' });

      const turns = store.toTurns('conv-1');
      expect(turns).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]);
    });

    it('returns empty array for non-existent conversation', () => {
      expect(store.toTurns('nonexistent')).toEqual([]);
    });
  });

  describe('no-op methods', () => {
    it('setTitle is no-op', () => {
      store.getOrCreate('conv-1');
      store.setTitle('conv-1', 'My Chat');
      // Title not stored - still default
      expect(store.get('conv-1')!.title).toBe('New Conversation');
    });

    it('delete returns false', () => {
      store.getOrCreate('conv-1');
      expect(store.delete('conv-1')).toBe(false);
      // Conversation still exists
      expect(store.has('conv-1')).toBe(true);
    });

    it('entries yields nothing', () => {
      store.getOrCreate('conv-1');
      const entries = [...store.entries()];
      expect(entries).toEqual([]);
    });

    it('getMessage returns undefined', () => {
      store.appendMessages('conv-1', [{ role: 'user', content: 'Hi' }]);
      expect(store.getMessage('conv-1', 'any-message-id')).toBeUndefined();
    });

    it('createFromTurns returns empty', () => {
      const result = store.createFromTurns([{ role: 'user', content: 'Hi' }]);
      expect(result.conversationId).toBe('');
      expect(result.title).toBe('');
    });
  });
});
