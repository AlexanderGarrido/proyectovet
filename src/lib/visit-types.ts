export interface VisitRecord {
  id: number; appointmentId: number | null; patientId: number; date: string;
  reason: string; subjective: string | null; diagnosis: string | null;
  treatment: string | null; observations: string | null;
  vitalSigns: { temperature?: number; heartRate?: number; weight?: number; respiratoryRate?: number } | null;
}
export interface VisitSnapshot {
  id: number; patientId: number; ownerId: number; veterinarianId: string;
  veterinarianName: string | null; scheduledAt: string; endAt: string;
  status: string; type: string; reason: string | null; notes: string | null;
  visitAddress: string | null; updatedAt: string; startedAt: string | null; completedAt: string | null;
  noCharge?: boolean;
  patient: { name: string; species: string; breed: string | null; weight: string | null; notes: string | null };
  owner: { firstName: string; lastName: string; phone: string | null; address: string | null };
  records: VisitRecord[];
  invoices: { id: number; total: string; paid: number; status: string; invoiceNumber: string }[];
  vaccines: { name: string; applicationDate: string; nextDoseDate: string | null }[];
}
export interface VisitProduct { id: number; name: string; stock: string; unit: string; }
export interface VisitLocation { id: number; name: string; assignedVetId: string | null; stocks: { productId: number; stock: string }[]; }
export interface DaySnapshot {
  userId: string; userName: string; role: string; day: string; preparedAt: string;
  visits: VisitSnapshot[]; products: VisitProduct[]; locations: VisitLocation[];
}
export interface VisitOperation {
  id: string; visitId: number; expectedUpdatedAt: string;
  predecessorId?: string;
  action: 'travel' | 'start' | 'save' | 'complete';
  record?: {
    reason: string; subjective?: string; diagnosis?: string; treatment?: string; observations?: string;
    vitalSigns?: { temperature?: number; heartRate?: number; weight?: number; respiratoryRate?: number };
    supplies?: { productId: number; quantity: number; locationId?: number | null }[];
    photos?: string[];
  };
  charge?: { description: string; amount: number };
  payment?: { amount: number; method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'; reference?: string };
  noCharge?: boolean;
}
export interface VisitResult { visitId: number; recordId: number | null; invoiceId: number | null; status: string; updatedAt: string; }
