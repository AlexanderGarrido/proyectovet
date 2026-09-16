import { useState } from 'react';
import { OwnerForm } from './OwnerForm';

export function OwnerEditor({ ownerId }: { ownerId: number }) {
  const [editing, setEditing] = useState(false);
  return editing ? <OwnerForm ownerId={ownerId} onCancel={() => setEditing(false)} onSaved={() => window.location.reload()} />
    : <button type="button" onClick={() => setEditing(true)} className="text-primary text-sm py-2 mt-2">Editar responsable</button>;
}
