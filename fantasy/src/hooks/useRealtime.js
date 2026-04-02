import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Generic hook to subscribe to Supabase realtime changes on a table.
 * @param {string} table - Table name
 * @param {function} onInsert - Called with new row on INSERT
 * @param {function} onUpdate - Called with updated row on UPDATE
 */
export function useRealtime(table, { onInsert, onUpdate } = {}) {
  useEffect(() => {
    const channel = supabase.channel(`realtime-${table}`);

    if (onInsert) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
        onInsert(payload.new);
      });
    }
    if (onUpdate) {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (payload) => {
        onUpdate(payload.new);
      });
    }

    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [table]);
}
