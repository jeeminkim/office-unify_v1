const $ = (id) => document.getElementById(id);

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function fillDl(dl, rows) {
  dl.innerHTML = '';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.innerHTML = typeof v === 'string' && v.includes('<') ? v : esc(v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
}

function fmtPostVerify(v) {
  if (!v) return '-';
  const alive = v.processExists ? '예(아직 살아 있음)' : '아니오';
  return [
    `시각: ${v.at || '-'}`,
    `프로세스 존재: ${alive}`,
    `포트 LISTEN 잔존: ${v.portStillBound ? '예' : '아니오'}`,
    `health pid 일치: ${v.healthReferencesPid ? '예' : '아니오'}`,
    `heartbeat 최근: ${v.healthHeartbeatRecent ? '예' : '아니오'}`
  ].join('<br/>');
}

function fmtVerifySteps(st) {
  if (!st?.verificationSteps?.length) return fmtPostVerify(st?.postVerification);
  return st.verificationSteps
    .map(
      (s) =>
        `#${s.attemptNo} alive=${s.processExists} port=${s.portStillBound} matchedAlive=${s.matchedPidAlive} healthPid=${s.healthPid ?? '-'}`
    )
    .join('<br/>');
}

async function refreshStatus() {
  $('statusErr').textContent = '';
  try {
    const r = await fetch('/api/status');
    const j = await r.json();

    fillDl($('dlExec'), [
      ['상태', j.executionState || (j.aiOfficeRunning ? 'Running' : 'Stopped')],
      ['추정 PID (health)', j.pid ?? '-'],
      ['Repo', j.repoRoot ?? '-'],
      ['로그 일자(KST)', j.logDailyKey ?? '-']
    ]);

    fillDl($('dlHealth'), [
      ['Last Heartbeat', j.lastHeartbeatAt ?? '-'],
      ['Discord Ready', j.discordReady ? '예' : '아니오'],
      ['Last Error 요약', j.lastError ?? j.lastErrorSummary ?? '-'],
      ['Last Interaction', j.lastInteractionAt ?? '-']
    ]);

    const tc = j.trackedChild;
    const x = j.processCrossCheck;
    fillDl($('dlProcess'), [
      ['tracked PID', tc?.pid ?? '-'],
      ['추적 프로세스 생존', j.trackedAlive ? '예' : '아니오'],
      ['matched PID 목록', x?.matchedAiOfficePids?.length ? x.matchedAiOfficePids.join(', ') : '-'],
      ['port owner PID', x?.portOwnerPid ?? '-'],
      ['cwd', tc?.cwd ?? j.cwd ?? '-'],
      ['시작 시각', tc?.startedAt ?? j.startedAt ?? '-']
    ]);

    const st = j.lastStopAttempt;
    fillDl($('dlStop'), [
      ['시도 시각', st?.attemptedAt ?? '-'],
      ['stopPhase', j.stopPhase ?? st?.stopPhase ?? '-'],
      ['lastStopMethod', st?.lastStopMethod ?? st?.method ?? '-'],
      ['force fallback 사용', st?.forceFallbackUsed ? '예' : '아니오'],
      ['최종 판정', st?.stopFinalStatus ?? '-'],
      ['PID', st?.pid ?? '-'],
      ['안내 메시지', st?.userMessage ?? '-'],
      ['다단계 검증', fmtVerifySteps(st)]
    ]);

    const sc = j.lastProcessScan;
    fillDl($('dlScan'), [
      ['검사 시각', sc?.at ?? '-'],
      ['요약', sc?.summary ?? '(검사 버튼으로 갱신)'],
      ['스캔 오류', sc?.scanError ?? '-']
    ]);

    const k = j.lastKillAttempt;
    fillDl($('dlKill'), [
      ['시각', k?.at ?? '-'],
      ['PID', k?.pid ?? '-'],
      ['강제', k ? (k.force ? '예' : '아니오') : '-'],
      ['결과', k ? (k.success ? '시도 완료' : '실패') : '-'],
      ['메시지', k?.message ?? '-']
    ]);

    const lg = j.logGuide || {};
    const list = $('logGuideList');
    list.innerHTML = '';
    const items = [
      ['운영 패널 전용(시작/중지/kill)', lg.controlPanelLog],
      ['핵심 운영 이벤트', lg.officeOps],
      ['오류', lg.officeError],
      ['상세 런타임(중지 전후 일부)', lg.officeRuntime],
      ['상태 스냅샷', lg.officeHealth],
      ['패널이 띄운 자식 stdout', lg.childStdoutLog]
    ];
    for (const [label, path] of items) {
      if (!path) continue;
      const li = document.createElement('li');
      li.innerHTML = `<strong>${esc(label)}</strong><br/><code>${esc(path)}</code>`;
      list.appendChild(li);
    }
  } catch (e) {
    $('statusErr').textContent = '상태 조회 실패: ' + e;
  }
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || r.statusText);
  return j;
}

async function scanProcesses() {
  $('procSection').hidden = false;
  $('procSummary').textContent = '조회 중…';
  $('killRow').innerHTML = '';
  try {
    const r = await fetch('/api/processes');
    const j = await r.json();
    $('procSummary').textContent = j.scanSummary || '요약 없음';
    const row = $('killRow');
    for (const p of j.processes || []) {
      if (p.pid <= 0) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '안전 종료 pid ' + p.pid;
      b.className = 'secondary';
      b.onclick = async () => {
        if (!p.matchedAiOffice) {
          alert('ai-office로 식별되지 않은 PID입니다. 강제 kill을 사용하세요.');
          return;
        }
        if (!confirm('PID ' + p.pid + ' 에 종료 신호를 보낼까요?')) return;
        try {
          const res = await postJson('/api/kill/' + p.pid + '?force=0', {});
          alert(res.message || 'ok');
          scanProcesses();
          refreshStatus();
        } catch (e) {
          alert(e.message || e);
        }
      };
      row.appendChild(b);
      const bk = document.createElement('button');
      bk.type = 'button';
      bk.textContent = '강제 kill ' + p.pid;
      bk.className = 'danger';
      bk.onclick = async () => {
        if (!confirm('PID ' + p.pid + ' 강제 종료? 마지막 확인입니다.')) return;
        try {
          const res = await postJson('/api/kill/' + p.pid + '?force=1', {});
          alert(res.message || 'ok');
          scanProcesses();
          refreshStatus();
        } catch (e) {
          alert(e.message || e);
        }
      };
      row.appendChild(bk);
    }
    refreshStatus();
  } catch (e) {
    $('procSummary').textContent = String(e);
  }
}

document.getElementById('hostHint').textContent = location.origin;

document.getElementById('btnStart').onclick = async () => {
  try {
    const skipBuild = document.getElementById('skipBuild').checked;
    const r = await postJson('/api/start', { skipBuild });
    alert(r.message || 'ok');
    refreshStatus();
  } catch (e) {
    alert(e.message || e);
  }
};

document.getElementById('btnStop').onclick = async () => {
  try {
    const r = await postJson('/api/stop', {});
    alert(r.message || 'ok');
    setTimeout(refreshStatus, 3200);
    refreshStatus();
  } catch (e) {
    alert(e.message || e);
  }
};

document.getElementById('btnRestart').onclick = async () => {
  try {
    const skipBuild = document.getElementById('skipBuild').checked;
    const r = await postJson('/api/restart', { skipBuild });
    alert((r.start && r.start.message) || r.message || 'ok');
    setTimeout(refreshStatus, 3200);
    refreshStatus();
  } catch (e) {
    alert(e.message || e);
  }
};

document.getElementById('btnScan').onclick = scanProcesses;

refreshStatus();
setInterval(refreshStatus, 15000);
