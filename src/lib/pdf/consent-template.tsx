import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { clinic, brandColors as c } from '../clinic';
import { ALMA_LOGO_DATA_URI } from './logo-data';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: c.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: c.green },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 88, height: 78, objectFit: 'contain' },
  clinicName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: c.green },
  clinicSub: { fontSize: 9, color: c.muted, marginTop: 2 },
  titleBadge: { backgroundColor: c.green, color: '#ffffff', padding: '6 12', borderRadius: 4, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 24, marginBottom: 8 },
  field: { flex: 1 },
  label: { fontSize: 8, color: '#9ca3af', marginBottom: 2 },
  value: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 16 },
  descriptionBox: { border: '1 solid #e5e7eb', borderRadius: 4, padding: 12, marginBottom: 16 },
  legalText: { fontSize: 9, color: c.muted, lineHeight: 1.5, marginBottom: 16 },
  signatureArea: { marginTop: 24, alignItems: 'center' },
  signatureImg: { width: 220, height: 90, objectFit: 'contain', border: '1 solid #e5e7eb', borderRadius: 4 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#374151', width: 220, marginTop: 4 },
  signatureLabel: { fontSize: 8, color: c.muted, textAlign: 'center', marginTop: 4 },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  pageNumber: { fontSize: 8, color: c.mutedLight, textAlign: 'center', marginTop: 12 },
});

const typeLabels: Record<string, string> = {
  cirugia: 'Cirugía',
  eutanasia: 'Eutanasia',
  anestesia: 'Anestesia',
  procedimiento: 'Procedimiento',
  otro: 'Otro procedimiento',
};

interface ConsentPDFProps {
  consent: {
    id: number;
    type: string;
    description: string;
    signedByName: string;
    signedByRelation?: string | null;
    signature: string;
    createdAt: string;
    patientName?: string | null;
    ownerFirstName?: string | null;
    ownerLastName?: string | null;
    veterinarianName?: string | null;
  };
}

export function ConsentPDF({ consent }: ConsentPDFProps) {
  const date = new Date(consent.createdAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image style={styles.logo} src={ALMA_LOGO_DATA_URI} />
            <View>
              <Text style={styles.clinicName}>{clinic.name}</Text>
              <Text style={styles.clinicSub}>{clinic.subtitle}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.titleBadge}>Consentimiento Informado</Text>
            <Text style={{ fontSize: 9, color: c.muted, marginTop: 6 }}>N° {consent.id}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Procedimiento</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>PACIENTE</Text>
              <Text style={styles.value}>{consent.patientName || '—'}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>TUTOR</Text>
              <Text style={styles.value}>{consent.ownerFirstName} {consent.ownerLastName}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>TIPO</Text>
              <Text style={styles.value}>{typeLabels[consent.type] || consent.type}</Text>
            </View>
          </View>
        </View>
        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descripción del Procedimiento</Text>
          <View style={styles.descriptionBox}>
            <Text>{consent.description}</Text>
          </View>
        </View>

        <Text style={styles.legalText}>
          Declaro que he sido informado(a) de forma clara por el equipo veterinario de {clinic.name} sobre la
          naturaleza, riesgos, beneficios y alternativas del procedimiento descrito arriba para mi mascota, y que
          todas mis preguntas fueron respondidas satisfactoriamente. Autorizo voluntariamente su realización.
        </Text>

        <View style={styles.signatureArea}>
          <Image style={styles.signatureImg} src={consent.signature} />
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>{consent.signedByName}</Text>
          {consent.signedByRelation && <Text style={styles.signatureLabel}>{consent.signedByRelation}</Text>}
          <Text style={styles.signatureLabel}>Firmado el {date}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={{ fontSize: 8, color: c.mutedLight }}>
            Atendido por {consent.veterinarianName || 'el equipo veterinario'} — {clinic.name}
          </Text>
        </View>

        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
