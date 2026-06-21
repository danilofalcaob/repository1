/**
 * Cliente do servidor de pager (pcr-pager-server estendido com FCM).
 * Registra o token do dispositivo numa equipe e dispara o Código Azul.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getDeviceToken } from './notifications';
import { ROLES, TeamState } from './clinicalData';

const CFG_KEY = 'pcr_pager_cfg';

export interface PagerConfig {
  url: string;
  team: string;
  name: string;
  enabled?: boolean;
}

export async function loadConfig(): Promise<PagerConfig> {
  const raw = await AsyncStorage.getItem(CFG_KEY);
  return raw ? JSON.parse(raw) : { url: '', team: '', name: '' };
}

export async function saveConfig(cfg: PagerConfig): Promise<void> {
  await AsyncStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/** Ativa o pager neste aparelho: pega o token e registra no servidor. */
export async function enablePager(cfg: PagerConfig): Promise<void> {
  const url = cfg.url.replace(/\/+$/, '');
  const token = await getDeviceToken();
  const resp = await fetch(url + '/registerToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      team: cfg.team,
      name: cfg.name,
      token,
      platform: Platform.OS,
    }),
  });
  if (!resp.ok) throw new Error('Servidor respondeu ' + resp.status);
  await saveConfig({ ...cfg, url, enabled: true });
}

/** Dispara o Código Azul para a equipe (não bloqueante). */
export async function triggerCodeBlue(team: TeamState): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg.url || !cfg.team) return;
  const roles = ROLES.filter((r) => team.roles[r.id]).map((r) => {
    const m = team.members.find((x) => x.id === team.roles[r.id]);
    return r.name + ': ' + (m ? m.name : '—');
  });
  try {
    await fetch(cfg.url.replace(/\/+$/, '') + '/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: cfg.team, by: cfg.name, roles }),
    });
  } catch {
    // silencioso: o alarme local já tocou
  }
}
