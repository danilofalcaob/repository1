/**
 * Conteúdo clínico mínimo reutilizado do PWA. As funções da equipe são as
 * mesmas de pcr/data.js. Para o app completo, porte o restante de data.js
 * (5H/5T, algoritmos, bundle pós-RCE) — a lógica já está estruturada lá.
 * USO EXCLUSIVAMENTE ADULTO.
 */
export interface Role {
  id: string;
  name: string;
}

export const ROLES: Role[] = [
  { id: 'lider', name: 'Líder' },
  { id: 'viaAerea', name: 'Via Aérea' },
  { id: 'comp1', name: 'Compressão - 1º' },
  { id: 'comp2', name: 'Compressão - 2º' },
  { id: 'monitor', name: 'Monitorização/Desfibrilação' },
  { id: 'medicacao', name: 'Medicamentos' },
];

export interface Member {
  id: string;
  name: string;
}

export interface TeamState {
  shiftDate: string;
  members: Member[];
  roles: Record<string, string>; // roleId -> memberId
}
