import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from 'react-query';
import { NoteWorkspaceContext } from '../offline/useNoteWorkspace';
import { attendanceWorkspace } from '../attendance/workspace';
import { connection } from '../api/connection';
import { updateBlockReason } from '../offline/updateGuard';
import { reauthUrl } from '../offline/pwa';
import { acquireWorkspaceLock, adoptOwner, cleanupKey, clearDeviceRecords, deniedKey, Identity, readSession, requireSingleClient, revokeSession, savedOwner } from './session';
import './auth.css';

export const AuthContext = createContext<{ user?: Identity; logout: () => void }>({ logout: () => {} });
export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'checking' | 'login' | 'ready' | 'preparing' | 'cleaning' | 'error'>('checking');
  const [user, setUser] = useState<Identity>();
  const [message, setMessage] = useState('');
  const release = useRef<(() => Promise<void>)>();
  const running = useRef(false);
  const notes = useContext(NoteWorkspaceContext);
  const queries = useQueryClient();
  const freeze = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 'preparing') freeze.current?.setAttribute('inert', '');
    else freeze.current?.removeAttribute('inert');
  }, [phase]);
  useEffect(() => {
    let cancelled = false;
    let unlock: (() => Promise<void>) | undefined;
    (async () => {
      if (localStorage.getItem(cleanupKey)) { setPhase('cleaning'); return; }
      unlock = await acquireWorkspaceLock();
      if (cancelled) { unlock(); return; }
      release.current = unlock;
      let identity: Identity | null;
      try { identity = await readSession(); }
      catch (error) {
        // Offline use is only restored for an already authenticated local owner.
        if (navigator.onLine !== false || localStorage.getItem(deniedKey)) throw error;
        identity = savedOwner();
      }
      if (cancelled) return;
      if (!identity) {
        localStorage.setItem(deniedKey, '1');
        setPhase('login'); return;
      }
      adoptOwner(identity);
      setUser(identity); setPhase('ready');
    })().catch(error => { if (!cancelled) { setMessage(error.message); setPhase('error'); } });
    return () => { cancelled = true; unlock?.(); if (release.current === unlock) release.current = undefined; };
  }, []);

  const finish = async () => {
    // This marker is written only after every local change has reached the server.
    await Promise.all([notes.suspendForLogout(), attendanceWorkspace.suspendForLogout()]);
    await revokeSession();
    await Promise.all([notes.store.close(), attendanceWorkspace.store.close()]);
    queries.clear();
    await clearDeviceRecords();
    window.location.replace('/?loggedOut=1');
  };
  const logout = async () => {
    if (running.current) return;
    running.current = true; setMessage('');
    let irreversible = false;
    try {
      if (navigator.onLine === false) throw new Error('온라인에서 기록을 동기화한 뒤 로그아웃할 수 있습니다.');
      document.querySelectorAll('audio').forEach(audio => audio.pause());
      await new Promise(resolve => setTimeout(resolve, 0));
      const blocked = updateBlockReason();
      if (blocked || !notes.canNavigate() || attendanceWorkspace.getSnapshot().unsaved || connection.writes() || queries.isMutating())
        throw new Error(blocked || '진행 중인 입력과 저장을 마친 뒤 다시 로그아웃해 주세요.');
      await requireSingleClient();
      setPhase('preparing');
      await release.current?.(); release.current = undefined;
      release.current = await acquireWorkspaceLock(true);
      // Let recent keystrokes pass the existing 700 ms sync debounce.
      await new Promise(resolve => setTimeout(resolve, 750));
      await Promise.all([notes.retry(), attendanceWorkspace.retry()]);
      const n = notes.getSnapshot(), a = attendanceWorkspace.getSnapshot();
      if (!notes.canNavigate() || notes.pendingCount() || n.error || n.storageError || n.fetching || n.saving.length || a.unsaved || a.error || a.storageError || a.busy || a.pages.some(page => page.dirty || page.conflicts.length))
        throw new Error('동기화하지 못한 기록이나 충돌이 있습니다. 해결한 뒤 다시 로그아웃해 주세요.');
      await requireSingleClient();
      localStorage.setItem(cleanupKey, '1');
      irreversible = true; setPhase('cleaning');
      await finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그아웃에 실패했습니다.');
      if (!irreversible) {
        await release.current?.(); release.current = undefined;
        try { release.current = await acquireWorkspaceLock(); setPhase('ready'); }
        catch { setPhase('error'); }
      }
    } finally { running.current = false; }
  };
  const retryCleanup = async () => {
    if (running.current) return;
    running.current = true; setMessage('');
    try {
      await requireSingleClient();
      if (!release.current) release.current = await acquireWorkspaceLock(true);
      await finish();
    } catch (error) { setMessage(error instanceof Error ? error.message : '기록 정리에 실패했습니다.'); }
    finally { running.current = false; }
  };
  if (phase === 'ready' || phase === 'preparing') return (
    <AuthContext.Provider value={{ user, logout: () => { void logout(); } }}>
      {message && <div className="auth-notice" role="alert">{message}<button onClick={() => setMessage('')}>닫기</button></div>}
      {phase === 'preparing' && <div className="auth-progress" role="status">기록을 동기화하고 있습니다…</div>}
      <div ref={freeze} aria-busy={phase === 'preparing'}>{children}</div>
    </AuthContext.Provider>
  );
  const error = new URLSearchParams(window.location.search).get('authError');
  return <main className="auth-screen"><section className="auth-card">
    <p className="auth-eyebrow">MUSIC · CLASSROOM</p>
    <h1>{phase === 'cleaning' ? '기기 기록 정리' : '나의 수업 보관함'}</h1>
    <p>{phase === 'checking' ? '로그인 상태를 확인하고 있습니다…' : phase === 'cleaning' ? '서버의 기록은 보관하고 이 기기의 기록을 삭제합니다. 정리가 끝날 때까지 기다려 주세요.' : '음악과 수업 기록을 이어서 사용하세요. 허용된 Google 계정으로 로그인할 수 있습니다.'}</p>
    {(message || error) && <p role="alert">{message || (error === 'forbidden' ? '허용된 계정이 아닙니다.' : '로그인을 완료하지 못했습니다. 다시 시도해 주세요.')}</p>}
    {phase === 'cleaning' ? <button className="button accent" onClick={() => { void retryCleanup(); }}>정리 다시 시도</button> : phase !== 'checking' && <a className="button accent" href={reauthUrl()}>Google로 로그인</a>}
    {phase === 'error' && <button className="button secondary" onClick={() => window.location.reload()}>연결 다시 확인</button>}
    {phase === 'login' && <p className="auth-footnote">이 기기에서 로그아웃하기 전까지 로그인을 유지합니다.</p>}
  </section></main>;
}
