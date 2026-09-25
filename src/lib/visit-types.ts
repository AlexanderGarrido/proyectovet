/**
 * Límites y versión de la copia diaria. Están aquí, con los tipos, porque
 * los lee tanto el servidor que la arma como la pantalla que la explica:
 * si vivieran junto a la consulta de base, importarlas desde el navegador
 * arrastraría el cliente de PostgreSQL al paquete del teléfono.
 */
export const DAY_LIMITS = { visits: 150, recordsPerPatient: 20, vaccinesPerPatient: 20, products: 500, recordsTotal: 1500, directory: 2000, directoryRecords: 3 } as const;
export const DAY_SCHEMA_VERSION = 3;

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
  /** 'sin_cita' si la cita se creó al atender. Ausente en copias antiguas. */
  origin?: 'agendada' | 'sin_cita';
  /** Solo en visitas locales creadas sin señal: alertas traídas en la copia. */
  alerts?: { id: number; category: string; text: string; validUntil: string | null }[];
  patient: { name: string; species: string; breed: string | null; weight: string | null; notes: string | null };
  owner: { firstName: string; lastName: string; phone: string | null; address: string | null };
  records: VisitRecord[];
  invoices: { id: number; total: string; paid: number; status: string; invoiceNumber: string }[];
  vaccines: { name: string; applicationDate: string; nextDoseDate: string | null }[];
}
/**
 * Paciente del directorio que viaja en la copia del día, para poder atender
 * sin cita y sin señal. Trae lo justo para atender con seguridad —quién es,
 * de quién es, a qué es alérgico y cómo le fue las últimas veces—, no el
 * historial completo.
 */
export interface PatientCard {
  id: number; name: string; species: string; breed: string | null; weight: string | null; notes: string | null;
  ownerId: number;
  owner: { firstName: string; lastName: string; phone: string | null; address: string | null };
  alerts: { id: number; category: string; text: string; validUntil: string | null }[];
  records: VisitRecord[];
  vaccines: { name: string; applicationDate: string; nextDoseDate: string | null }[];
}
export interface VisitProduct { id: number; name: string; stock: string; unit: string; }
export interface VisitLocation { id: number; name: string; assignedVetId: string | null; stocks: { productId: number; stock: string }[]; }
/**
 * Qué alcanzó a incluir la copia descargada. Sin este manifiesto la
 * pantalla no puede distinguir «este paciente no tiene más antecedentes»
 * de «la copia trajo solo los últimos veinte»: una truncación silenciosa
 * se lee como historial completo.
 */
export interface DayCoverage {
  schemaVersion: number;
  visits: number;
  visitsTruncated: boolean;
  recordsPerPatient: number;
  recordsTruncated: boolean;
  vaccinesPerPatient: number;
  products: number;
  productsTruncated: boolean;
  /** Antecedentes clínicos omitidos por permisos del rol, no por límite. */
  clinicalWithheld: boolean;
  /** Pacientes del directorio; ausente si el rol no lo recibe. */
  directory?: number;
  directoryTruncated?: boolean;
}

export interface DaySnapshot {
  userId: string; userName: string; role: string; day: string; preparedAt: string;
  visits: VisitSnapshot[]; products: VisitProduct[]; locations: VisitLocation[];
  coverage?: DayCoverage;
  /** Pacientes activos para atender sin cita sin señal (solo admin y veterinario). */
  directory?: PatientCard[];
  /** Versión del formato con que se escribió esta copia en el dispositivo. */
  schemaVersion?: number;
}
export interface VisitOperation {
  id: string; visitId: number; expectedUpdatedAt: string;
  predecessorId?: string;
  /** Versión del formato de la operación; ausente = formato inicial (1). */
  version?: number;
  /**
   * Momento declarado por el dispositivo. Es una afirmación del cliente,
   * no una medición confiable: el servidor guarda además su propia hora de
   * recepción y no ordena por esta.
   */
  occurredAt?: string;
  action: 'travel' | 'start' | 'save' | 'complete';
  record?: {
    reason: string; subjective?: string; diagnosis?: string; treatment?: string; observations?: string;
    vitalSigns?: { temperature?: number; heartRate?: number; weight?: number; respiratoryRate?: number };
    supplies?: { productId: number; quantity: number; locationId?: number | null }[];
    photos?: string[];
    templateId?: number; templateVersion?: number;
    /**
     * Registro al que corrige esta nota. Es lo único que permite escribir
     * sobre una visita cerrada: no reescribe el original, agrega una
     * entrada nueva que lo referencia, con su propio autor y fecha.
     */
    amendsRecordId?: number;
  };
  /**
   * Prestaciones del catálogo efectivamente realizadas. El cliente declara
   * qué y cuánto; el precio, los insumos asociados y el importe los
   * resuelve el servidor con la tarifa vigente. Convive con `charge` del
   * formato 1 mientras haya dispositivos con operaciones antiguas en cola.
   */
  items?: { serviceId: number; quantity: number }[];
  charge?: { description: string; amount: number };
  payment?: { amount: number; method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'; reference?: string };
  noCharge?: boolean;
}
/**
 * Apertura de una atención sin cita. Todavía no hay número de cita: en la
 * cola del dispositivo `visitId` es el id provisorio (negativo) de la
 * visita local, y lo que viaja al servidor es solo paciente y hora.
 */
export interface OpenVisitOperation {
  id: string;
  action: 'open';
  visitId: number;
  patientId: number;
  occurredAt: string;
  predecessorId?: undefined;
}
/** Lo que puede haber en la cola del dispositivo. */
export type QueuedOperation = VisitOperation | OpenVisitOperation;
export interface VisitResult {
  visitId: number; recordId: number | null; invoiceId: number | null; status: string; updatedAt: string;
  /** Hora del servidor al aceptar la operación. */
  receivedAt?: string;
  /** Líneas de prestación efectivamente aplicadas (formato 2). */
  serviceItemIds?: number[];
}
