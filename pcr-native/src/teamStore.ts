/** Persistência da equipe do plantão (check-in + funções designadas). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TeamState } from './clinicalData';

const TEAM_KEY = 'pcr_team';
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const emptyTeam = (): TeamState => ({ shiftDate: todayStr(), members: [], roles: {} });

export async function loadTeam(): Promise<TeamState> {
  const r = await AsyncStorage.getItem(TEAM_KEY);
  return r ? JSON.parse(r) : emptyTeam();
}
export async function saveTeam(t: TeamState): Promise<void> {
  await AsyncStorage.setItem(TEAM_KEY, JSON.stringify(t));
}
