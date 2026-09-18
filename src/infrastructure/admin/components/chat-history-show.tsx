import React from 'react';
import { flat } from 'adminjs';

/**
 * A draft's AI conversation, as a conversation.
 *
 * @remarks
 * - **Why it exists.** The turns were already stored — `recipe_drafts.chat_history`
 *   has held them all along — and the panel printed the column as one run-on
 *   blob of JSON. Reading what a cook actually asked for, and what the model
 *   answered, meant copying the cell into a formatter. A record you cannot read
 *   is not a record anyone consults when a recipe comes out wrong.
 * - **Three states, not one.** A turn can be ordinary, an `error` (the model
 *   failed to produce a usable refinement), or `rejected` — a proposed change
 *   the cook declined. The last one matters most when reading back: an assistant
 *   turn describing a change is not proof the change happened, and without the
 *   marking the transcript reads as an account of the recipe.
 * - **`rejected` is read even though the server's `ChatMessage` does not declare
 *   it.** The column is JSON and the app writes the flag; a viewer that ignored
 *   it would quietly present declined work as applied.
 */
interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

interface Turn {
  role?: string;
  content?: string;
  error?: boolean;
  rejected?: boolean;
}

const parseTurns = (raw: unknown): Turn[] => {
  if (Array.isArray(raw)) return raw as Turn[];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Turn[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const ASSISTANT = 'assistant';

export default function ChatHistoryShow({ property, record }: Props) {
  const turns = parseTurns(flat.get(record.params, property.path));

  if (turns.length === 0) {
    return (
      <div style={{ padding: '4px 0' }}>
        <div style={{ color: '#6c757d', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
          Conversation
        </div>
        <div style={{ fontSize: '13px', color: '#adb5bd' }}>
          No conversation — this draft was never refined.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ color: '#6c757d', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>
        Conversation · {turns.length} turn{turns.length === 1 ? '' : 's'}
      </div>
      {turns.map((turn, index) => {
        const fromAssistant = turn.role === ASSISTANT;
        return (
          <div
            key={index}
            style={{
              marginBottom: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              borderLeft: `3px solid ${turn.error ? '#d93f3f' : fromAssistant ? '#5b5bd6' : '#adb5bd'}`,
              background: fromAssistant ? '#f5f5fb' : '#fafafa',
              opacity: turn.rejected ? 0.6 : 1,
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#6c757d',
                marginBottom: '3px',
                display: 'flex',
                gap: '8px',
              }}
            >
              <span style={{ fontWeight: 600 }}>{fromAssistant ? 'Assistant' : 'Cook'}</span>
              {turn.error ? <span style={{ color: '#d93f3f' }}>failed</span> : null}
              {turn.rejected ? <span style={{ color: '#8a6d3b' }}>declined by the cook</span> : null}
            </div>
            <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
              {String(turn.content ?? '')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
