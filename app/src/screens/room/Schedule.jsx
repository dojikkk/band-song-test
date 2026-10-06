// 합주 일정 조율 — when2meet 방식
//  1) 방장이 날짜 범위·시간대를 열면
//  2) 각자 "내 가능 시간" 칸을 눌러 표시하고 저장
//  3) "모두 보기"에서 겹치는 시간을 진하게 보여줌 → 방장이 합주로 확정
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { DockBar } from '../../components/Dock';
import { Button, Sheet, TextField, useToast } from '../../components/ui';
import { addRehearsal, createSchedule, deleteRehearsal, deleteSchedule, errorText, setAvailability } from '../../lib/api';
import { activeMembers, memberName } from '../../lib/selectors';
import { addDays, daysBetween, fmtDay, fmtHour, googleCalendarLink, weekday, ymd } from '../../lib/time';

const key = (day, hour) => `${day}|${hour}`;
const HOURS = Array.from({ length: 25 }, (_, i) => i);

export default function Schedule({ state, token, notify }) {
  const { me, band, schedule, rehearsals } = state;
  const isLeader = me.role === 'leader';
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [booking, setBooking] = useState(null); // { day, startHour } | {} (직접 추가)
  const [busy, setBusy] = useState(null);

  const run = async (k, fn, msg) => {
    setBusy(k);
    try {
      await fn();
      if (msg) toast(msg);
      await notify();
      return true;
    } catch (e) {
      toast(errorText(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const today = ymd(new Date());
  const upcoming = rehearsals.filter((r) => r.day >= today);
  const past = rehearsals.filter((r) => r.day < today);

  return (
    <>
      <section className="block">
        <div className="block-head">
          <h2 className="h-md">
            확정된 합주 <span className="count">{upcoming.length}</span>
          </h2>
          {isLeader && (
            <button className="ghost-btn small" onClick={() => setBooking({})}>
              <Icon name="plus" size={14} /> 직접 추가
            </button>
          )}
        </div>
        {upcoming.length === 0 ? (
          <p className="empty-line">
            {schedule ? '아래에서 다 같이 되는 시간을 찾으면 방장이 합주로 확정해요.' : '아직 잡힌 합주가 없어요.'}
          </p>
        ) : (
          <ul className="rehearsal-list">
            {upcoming.map((r) => (
              <Rehearsal key={r.id} r={r} band={band} isLeader={isLeader} busy={busy}
                onDelete={() => run(r.id, () => deleteRehearsal(token, r.id), '합주 일정을 지웠어요')} />
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="past">
            <summary>지난 합주 {past.length}개</summary>
            <ul className="rehearsal-list">
              {past.map((r) => (
                <Rehearsal key={r.id} r={r} band={band} isLeader={isLeader} busy={busy}
                  onDelete={() => run(r.id, () => deleteRehearsal(token, r.id))} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {schedule ? (
        <Poll
          key={schedule.id}
          state={state}
          token={token}
          notify={notify}
          onBook={(day, startHour) => setBooking({ day, startHour })}
          onRecreate={() => setCreating(true)}
          onClose={() => run('close', () => deleteSchedule(token), '일정 조율을 닫았어요')}
        />
      ) : (
        <section className="block">
          <h2 className="h-md">합주 일정 조율</h2>
          {isLeader ? (
            <>
              <p className="muted small">날짜 범위와 시간대를 열면 멤버들이 가능한 시간을 표시해요. 겹치는 시간이 한눈에 보여요.</p>
              <button className="primary-btn" onClick={() => setCreating(true)}>
                일정 조율 열기
              </button>
            </>
          ) : (
            <p className="empty-line">방장이 일정 조율을 열면 여기서 가능한 시간을 고를 수 있어요.</p>
          )}
        </section>
      )}

      {creating && (
        <CreatePollSheet
          replacing={Boolean(schedule)}
          busy={busy === 'create'}
          onClose={() => setCreating(false)}
          onCreate={async (v) => (await run('create', () => createSchedule(token, v), '일정 조율을 열었어요')) && setCreating(false)}
        />
      )}
      {booking && (
        <BookSheet
          initial={booking}
          poll={schedule}
          state={state}
          busy={busy === 'book'}
          onClose={() => setBooking(null)}
          onSave={async (v) => (await run('book', () => addRehearsal(token, v), '합주를 확정했어요')) && setBooking(null)}
        />
      )}
    </>
  );
}

function Rehearsal({ r, band, isLeader, busy, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li>
      <div className="rh-main">
        <strong>
          {fmtDay(r.day)} {fmtHour(r.start_hour)}–{fmtHour(r.end_hour)}
        </strong>
        {r.place && <span>{r.place}</span>}
        {r.note && <small>{r.note}</small>}
      </div>
      <div className="rh-actions">
        <a
          className="ghost-btn small"
          href={googleCalendarLink({ title: `${band.name} 합주`, day: r.day, startHour: r.start_hour, endHour: r.end_hour, place: r.place, note: r.note })}
          target="_blank"
          rel="noreferrer"
        >
          캘린더에 추가
        </a>
        {isLeader &&
          (confirm ? (
            <Button className="danger-btn small" busy={busy === r.id} onClick={onDelete}>
              지우기
            </Button>
          ) : (
            <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="합주 일정 지우기">
              <Icon name="trash" size={16} />
            </button>
          ))}
      </div>
    </li>
  );
}

function Poll({ state, token, notify, onBook, onRecreate, onClose }) {
  const { me, schedule: poll } = state;
  const isLeader = me.role === 'leader';
  const toast = useToast();
  const members = activeMembers(state);
  const days = useMemo(() => daysBetween(poll.start_date, poll.end_date), [poll.start_date, poll.end_date]);
  const hours = useMemo(() => HOURS.slice(poll.start_hour, poll.end_hour), [poll.start_hour, poll.end_hour]);
  const cellMap = useMemo(() => new Map(poll.cells.map((c) => [key(c.day, c.hour), c.member_ids])), [poll.cells]);
  const savedMine = useMemo(
    () => new Set(poll.cells.filter((c) => c.member_ids.includes(me.id)).map((c) => key(c.day, c.hour))),
    [poll.cells, me.id],
  );
  const savedKey = [...savedMine].sort().join(',');
  const responded = new Set(poll.responded);
  const iResponded = responded.has(me.id);

  const [mode, setMode] = useState(iResponded ? 'all' : 'mine');
  const [mine, setMine] = useState(savedMine);
  const [picked, setPicked] = useState(null); // "모두 보기"에서 누른 칸
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const paint = useRef(null); // 마우스 드래그로 칠하기: true(칠함)/false(지움)
  const mouseDown = useRef(false);

  useEffect(() => setMine(new Set(savedKey ? savedKey.split(',') : [])), [savedKey]);
  useEffect(() => {
    const up = () => {
      paint.current = null;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const dirty = [...mine].sort().join(',') !== savedKey;
  const setCell = (k, on) =>
    setMine((cur) => {
      const n = new Set(cur);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });

  const save = async () => {
    setSaving(true);
    try {
      const cells = [...mine].map((k) => {
        const [day, hour] = k.split('|');
        return { day, hour: Number(hour) };
      });
      await setAvailability(token, cells);
      toast(cells.length ? '가능한 시간을 저장했어요' : '‘다 안 돼요’로 저장했어요');
      await notify();
      setMode('all');
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 가장 많이 겹치는 시간 Top 5
  const best = useMemo(
    () =>
      poll.cells
        .filter((c) => c.member_ids.length > 0)
        .sort((a, b) => b.member_ids.length - a.member_ids.length || (a.day + String(a.hour).padStart(2, '0')).localeCompare(b.day + String(b.hour).padStart(2, '0')))
        .slice(0, 5),
    [poll.cells],
  );
  const notYet = members.filter((m) => !responded.has(m.id));
  const pickedIds = picked ? cellMap.get(picked) || [] : [];
  const [pDay, pHour] = picked ? picked.split('|') : [];

  return (
    <section className="block">
      <div className="block-head">
        <h2 className="h-md">{poll.title}</h2>
        <span className="muted small">
          응답 {responded.size}/{members.length}명
        </span>
      </div>
      <p className="muted small">
        {fmtDay(poll.start_date)}–{fmtDay(poll.end_date)} · {fmtHour(poll.start_hour)}–{fmtHour(poll.end_hour)}
        {isLeader && notYet.length > 0 && ` · 아직: ${notYet.map((m) => m.name).join(', ')}`}
      </p>

      <div className="seg wide" role="tablist" aria-label="보기">
        <button role="tab" aria-selected={mode === 'mine'} className={mode === 'mine' ? 'on' : ''} onClick={() => setMode('mine')}>
          내 가능 시간{dirty && ' •'}
        </button>
        <button role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>
          모두 보기
        </button>
      </div>
      <p className="hint">
        {mode === 'mine'
          ? '되는 시간 칸을 눌러 칠해요. 컴퓨터에선 끌어서 여러 칸을 한 번에 칠할 수 있어요.'
          : '진할수록 되는 사람이 많아요. 칸을 누르면 누가 되는지 보여요.'}
      </p>

      <div className="grid-scroll">
        <div className="time-grid" style={{ gridTemplateColumns: `40px repeat(${days.length}, minmax(40px, 1fr))` }}
          onPointerLeave={() => (paint.current = null)}>
          <div className="tg-corner" />
          {days.map((d) => (
            <div key={d} className={`tg-day${['토', '일'].includes(weekday(d)) ? ' weekend' : ''}`}>
              {Number(d.slice(5, 7))}/{Number(d.slice(8))}
              <small>{weekday(d)}</small>
            </div>
          ))}
          {hours.map((h) => (
            <Row key={h}>
              <div className="tg-hour">{h}시</div>
              {days.map((d) => {
                const k = key(d, h);
                const ids = cellMap.get(k) || [];
                if (mode === 'mine') {
                  const on = mine.has(k);
                  return (
                    <button
                      key={k}
                      className={`tg-cell${on ? ' mine' : ''}`}
                      aria-pressed={on}
                      aria-label={`${fmtDay(d)} ${h}시 ${on ? '가능' : '안 됨'}`}
                      onPointerDown={(e) => {
                        if (e.pointerType !== 'mouse') return;
                        mouseDown.current = true;
                        paint.current = !on;
                        setCell(k, !on);
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType === 'mouse' && paint.current !== null) setCell(k, paint.current);
                      }}
                      onClick={() => {
                        if (mouseDown.current) {
                          mouseDown.current = false;
                          return;
                        }
                        setCell(k, !on);
                      }}
                    />
                  );
                }
                const ratio = members.length ? ids.length / members.length : 0;
                return (
                  <button
                    key={k}
                    className={`tg-cell heat${picked === k ? ' picked' : ''}${ids.length === members.length && ids.length > 0 ? ' full' : ''}`}
                    style={{ '--heat': ratio }}
                    onClick={() => setPicked(picked === k ? null : k)}
                    aria-label={`${fmtDay(d)} ${h}시 ${ids.length}명 가능`}
                  >
                    {ids.length > 0 ? ids.length : ''}
                  </button>
                );
              })}
            </Row>
          ))}
        </div>
      </div>

      {mode === 'all' && picked && (
        <div className="picked-box">
          <strong>
            {fmtDay(pDay)} {fmtHour(Number(pHour))} · {pickedIds.length}/{members.length}명
          </strong>
          <span className="small">
            {pickedIds.length ? `되는 사람: ${pickedIds.map((id) => memberName(state, id)).join(', ')}` : '되는 사람이 없어요'}
          </span>
          {members.some((m) => !pickedIds.includes(m.id)) && (
            <span className="small muted">
              안 되는 사람: {members.filter((m) => !pickedIds.includes(m.id)).map((m) => m.name).join(', ')}
            </span>
          )}
          {isLeader && (
            <button className="leader-btn small" onClick={() => onBook(pDay, Number(pHour))}>
              이 시간으로 합주 잡기
            </button>
          )}
        </div>
      )}

      {mode === 'all' && best.length > 0 && (
        <div className="best">
          <h3 className="section-title">많이 겹치는 시간</h3>
          <ol>
            {best.map((c) => (
              <li key={key(c.day, c.hour)}>
                <button className="row-link" onClick={() => setPicked(key(c.day, c.hour))}>
                  <span>
                    <strong>
                      {fmtDay(c.day)} {fmtHour(c.hour)}
                    </strong>
                    <small>{c.member_ids.map((id) => memberName(state, id)).join(', ')}</small>
                  </span>
                  <span className="best-count">
                    {c.member_ids.length}/{members.length}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {isLeader && (
        <div className="row-btns left">
          <button className="text-btn" onClick={onRecreate}>
            새로 조율하기
          </button>
          {!confirmClose ? (
            <button className="text-btn danger" onClick={() => setConfirmClose(true)}>
              조율 닫기
            </button>
          ) : (
            <span className="inline-confirm small">
              모두의 응답이 지워져요.
              <button className="text-btn danger" onClick={onClose}>
                닫기
              </button>
              <button className="text-btn" onClick={() => setConfirmClose(false)}>
                취소
              </button>
            </span>
          )}
        </div>
      )}

      {mode === 'mine' && (dirty || !iResponded) && (
        <DockBar>
          <div className="bar-row">
            <span className="bar-count">
              <strong>{mine.size}</strong>칸 선택{!iResponded && ' · 아직 응답 안 함'}
            </span>
            {dirty && (
              <button className="ghost-btn small" onClick={() => setMine(new Set(savedMine))} disabled={saving}>
                되돌리기
              </button>
            )}
            <Button className="primary-btn small" busy={saving} onClick={save}>
              {mine.size === 0 ? '다 안 돼요로 저장' : '저장'}
            </Button>
          </div>
        </DockBar>
      )}
    </section>
  );
}

// CSS grid에서 한 줄을 묶기 위한 껍데기 (display: contents)
function Row({ children }) {
  return <div className="tg-row">{children}</div>;
}

function CreatePollSheet({ replacing, busy, onClose, onCreate }) {
  const today = ymd(new Date());
  const [title, setTitle] = useState('합주 일정');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(23);
  const span = startDate && endDate ? daysBetween(startDate, endDate).length : 0;
  const ok = title.trim() && startDate && endDate && endDate >= startDate && span <= 21 && endHour > startHour;

  return (
    <Sheet
      title={replacing ? '새로 조율하기' : '일정 조율 열기'}
      onClose={onClose}
      footer={
        <Button busy={busy} disabled={!ok} onClick={() => onCreate({ title, startDate, endDate, startHour, endHour })}>
          {replacing ? '새로 열기 (이전 응답 지움)' : '열기'}
        </Button>
      }
    >
      <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} />
      <div className="two-col">
        <div className="field">
          <label htmlFor="sd">시작 날짜</label>
          <input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ed">끝 날짜</label>
          <input id="ed" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="two-col">
        <HourSelect id="sh" label="시작 시간" value={startHour} onChange={setStartHour} from={0} to={23} />
        <HourSelect id="eh" label="끝 시간" value={endHour} onChange={setEndHour} from={1} to={24} />
      </div>
      <p className="hint">
        {span > 21 ? '최대 3주까지 열 수 있어요.' : `${span}일 × ${Math.max(0, endHour - startHour)}시간 표가 만들어져요.`}
        {replacing && ' 새로 열면 이전 조율의 응답은 지워져요. 확정된 합주는 그대로예요.'}
      </p>
    </Sheet>
  );
}

function BookSheet({ initial, poll, state, busy, onClose, onSave }) {
  const today = ymd(new Date());
  const [day, setDay] = useState(initial.day || today);
  const [startHour, setStartHour] = useState(initial.startHour ?? 19);
  const [endHour, setEndHour] = useState(Math.min(24, (initial.startHour ?? 19) + 2));
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // 고른 시간대에 계속 되는 사람
  const okIds = useMemo(() => {
    if (!poll) return null;
    const map = new Map(poll.cells.map((c) => [key(c.day, c.hour), c.member_ids]));
    let ids = null;
    for (let h = startHour; h < endHour; h++) {
      const here = map.get(key(day, h)) || [];
      ids = ids === null ? here : ids.filter((x) => here.includes(x));
    }
    return ids || [];
  }, [poll, day, startHour, endHour]);

  return (
    <Sheet
      title="합주 확정"
      onClose={onClose}
      footer={
        <Button busy={busy} disabled={!day || endHour <= startHour} onClick={() => onSave({ day, startHour, endHour, place, note })}>
          확정하기
        </Button>
      }
    >
      <div className="field">
        <label htmlFor="bd">날짜</label>
        <input id="bd" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="two-col">
        <HourSelect id="bs" label="시작" value={startHour} onChange={(v) => { setStartHour(v); if (endHour <= v) setEndHour(Math.min(24, v + 1)); }} from={0} to={23} />
        <HourSelect id="be" label="끝" value={endHour} onChange={setEndHour} from={startHour + 1} to={24} />
      </div>
      {okIds && (
        <p className="hint">
          이 시간 내내 된다고 한 사람: {okIds.length ? okIds.map((id) => memberName(state, id)).join(', ') : '없음'}
        </p>
      )}
      <TextField label="장소" value={place} onChange={(e) => setPlace(e.target.value.slice(0, 40))} placeholder="예: 동아리방, ○○합주실 B룸" />
      <div className="field">
        <label htmlFor="bn">메모</label>
        <textarea id="bn" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 고민중독·Syringe 위주, 베이스 앰프 챙기기" />
      </div>
    </Sheet>
  );
}

function HourSelect({ id, label, value, onChange, from, to }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {HOURS.filter((h) => h >= from && h <= to).map((h) => (
          <option key={h} value={h}>
            {fmtHour(h)}
          </option>
        ))}
      </select>
    </div>
  );
}
