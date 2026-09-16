import { useEffect, useState } from 'react';
import { currentFieldUser, FIELD_EVENT } from '../../lib/field-storage';
export function useFieldIdentity(userId: string) {
  const [valid, setValid] = useState(true);
  useEffect(() => {
    const check = () => setValid(currentFieldUser() === userId);
    check(); window.addEventListener('storage', check); window.addEventListener(FIELD_EVENT, check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener(FIELD_EVENT, check); };
  }, [userId]);
  return valid;
}
