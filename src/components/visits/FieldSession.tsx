import { useEffect } from 'react';
import { activateFieldUser, currentFieldUser, syncPending } from '../../lib/field-storage';
export function FieldSession({ userId }: { userId: string }) {
  useEffect(() => {
    const sync = () => { if (currentFieldUser() === userId) void syncPending(userId).catch(() => {}); };
    activateFieldUser(userId).then(sync).catch(() => {});
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [userId]);
  return null;
}
