import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from "lucide-react";
import { events as eventsDB } from "@/lib/storage";
import type { CalendarEvent } from "@/types";

type View = "dia" | "semana" | "mes" | "año";

const DAYS_ES   = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const EVENT_COLORS = ["#000000","#2563eb","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2"];

// ── Date helpers ──────────────────────────────────────────────────────────────
const toISO    = (d: Date) => d.toISOString().slice(0, 10);
const today    = () => toISO(new Date());
const addDays  = (iso: string, n: number) => toISO(new Date(new Date(iso).getTime() + n * 86400000));

function startOfWeek(iso: string): string {
  const d   = new Date(iso);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Mon=0
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

// ── Main component ────────────────────────────────────────────────────────────
export default function AgendaView() {
  const [view,      setView]      = useState<View>("mes");
  const [cursor,    setCursor]    = useState(today());        // current date/week/month anchor
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>(eventsDB.getAll());
  const [modal,     setModal]     = useState<{ date: string; event?: CalendarEvent } | null>(null);

  const reload = () => setAllEvents(eventsDB.getAll());

  // Navigation
  const navigate = (dir: 1 | -1) => {
    const d = new Date(cursor);
    if (view === "dia")   d.setDate(d.getDate() + dir);
    if (view === "semana") d.setDate(d.getDate() + dir * 7);
    if (view === "mes")   d.setMonth(d.getMonth() + dir);
    if (view === "año")   d.setFullYear(d.getFullYear() + dir);
    setCursor(toISO(d));
  };

  const headerLabel = () => {
    const d = new Date(cursor);
    if (view === "dia")    return `${DAYS_ES[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
    if (view === "semana") {
      const s = new Date(startOfWeek(cursor));
      const e = new Date(addDays(startOfWeek(cursor), 6));
      return `${s.getDate()} ${MONTHS_ES[s.getMonth()]} — ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`;
    }
    if (view === "mes")    return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
    return `${d.getFullYear()}`;
  };

  return (
    <div className="flex flex-col h-full bg-s-bg overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-s-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setCursor(today())} className="px-3 py-1.5 border border-s-border rounded text-[12px] text-s-muted hover:text-s-text hover:border-s-text transition-colors">
            Hoy
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-s-surface text-s-muted hover:text-s-text transition-colors"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)}  className="p-1.5 rounded hover:bg-s-surface text-s-muted hover:text-s-text transition-colors"><ChevronRight size={16} /></button>
          </div>
          <span className="text-[14px] font-medium text-s-text">{headerLabel()}</span>
        </div>
        <div className="flex items-center gap-2">
          {(["dia","semana","mes","año"] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-[12px] capitalize transition-colors ${
                view === v ? "bg-s-accent text-white" : "text-s-muted hover:text-s-text"
              }`}
            >{v}</button>
          ))}
          <button onClick={() => setModal({ date: cursor })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-s-accent text-white rounded text-[12px] hover:opacity-80 transition-opacity ml-2"
          >
            <Plus size={13} /> Evento
          </button>
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-auto">
        {view === "mes"    && <MonthView   cursor={cursor} events={allEvents} onAdd={date => setModal({ date })} onEdit={ev => setModal({ date: ev.date, event: ev })} />}
        {view === "semana" && <WeekView    cursor={cursor} events={allEvents} onAdd={date => setModal({ date })} onEdit={ev => setModal({ date: ev.date, event: ev })} />}
        {view === "dia"    && <DayView     cursor={cursor} events={allEvents} onAdd={() => setModal({ date: cursor })} onEdit={ev => setModal({ date: ev.date, event: ev })} />}
        {view === "año"    && <YearView    cursor={cursor} events={allEvents} onSelectMonth={(y, m) => { setCursor(`${y}-${String(m+1).padStart(2,"0")}-01`); setView("mes"); }} />}
      </div>

      {/* Event modal */}
      {modal && (
        <EventModal
          date={modal.date}
          event={modal.event}
          onClose={() => setModal(null)}
          onSave={() => { reload(); setModal(null); }}
          onDelete={() => { reload(); setModal(null); }}
        />
      )}
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ cursor, events, onAdd, onEdit }: { cursor: string; events: CalendarEvent[]; onAdd: (d: string) => void; onEdit: (e: CalendarEvent) => void }) {
  const d     = new Date(cursor);
  const year  = d.getFullYear();
  const month = d.getMonth();
  const first = firstDayOfMonth(year, month);
  const days  = daysInMonth(year, month);
  const prevDays = daysInMonth(year, month - 1);

  const cells: { iso: string; cur: boolean }[] = [];
  for (let i = first - 1; i >= 0; i--)
    cells.push({ iso: `${year}-${String(month === 0 ? 12 : month).padStart(2,"0")}-${String(prevDays - i).padStart(2,"0")}`, cur: false });
  for (let d = 1; d <= days; d++)
    cells.push({ iso: `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`, cur: true });
  while (cells.length % 7 !== 0) {
    const n = cells.length - days - first + 1;
    cells.push({ iso: `${year}-${String(month+2>12?1:month+2).padStart(2,"0")}-${String(n).padStart(2,"0")}`, cur: false });
  }

  const todayIso = today();

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-s-border">
        {DAYS_ES.map(d => (
          <div key={d} className="py-2 text-center text-[11px] text-s-muted uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7" style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}>
        {cells.map(({ iso, cur }) => {
          const dayEvents = events.filter(e => e.date === iso);
          const isToday   = iso === todayIso;
          return (
            <div
              key={iso}
              onClick={() => cur && onAdd(iso)}
              className={`border-b border-r border-s-border p-1.5 cursor-pointer group overflow-hidden ${cur ? "bg-s-bg hover:bg-s-surface/50" : "bg-s-surface/30"} transition-colors`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[12px] w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? "bg-s-accent text-white font-medium" : cur ? "text-s-text" : "text-s-muted"
                }`}>
                  {parseInt(iso.slice(8))}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <div
                    key={ev.id}
                    onClick={e => { e.stopPropagation(); onEdit(ev); }}
                    className="text-[10px] px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-80"
                    style={{ backgroundColor: ev.color ?? "#000" }}
                  >
                    {ev.startTime && <span className="opacity-80 mr-1">{ev.startTime}</span>}
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-s-muted px-1">+{dayEvents.length - 3} más</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ cursor, events, onAdd, onEdit }: { cursor: string; events: CalendarEvent[]; onAdd: (d: string) => void; onEdit: (e: CalendarEvent) => void }) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayIso = today();

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid border-b border-s-border flex-shrink-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div />
        {days.map(iso => {
          const d = new Date(iso);
          const isToday = iso === todayIso;
          return (
            <div key={iso} className="py-2 text-center border-l border-s-border">
              <p className="text-[10px] text-s-muted uppercase">{DAYS_ES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</p>
              <p className={`text-[15px] font-light mx-auto w-8 h-8 flex items-center justify-center rounded-full mt-0.5 ${isToday ? "bg-s-accent text-white" : "text-s-text"}`}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>
      {/* Hour rows */}
      <div className="flex-1 overflow-y-auto">
        {HOURS.map(hour => (
          <div key={hour} className="grid min-h-[48px]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div className="text-[10px] text-s-muted text-right pr-2 pt-1 flex-shrink-0">{hour}</div>
            {days.map(iso => {
              const dayEvs = events.filter(e => e.date === iso && e.startTime?.startsWith(hour.slice(0,2)));
              return (
                <div
                  key={iso}
                  onClick={() => onAdd(iso)}
                  className="border-l border-b border-s-border relative cursor-pointer hover:bg-s-surface/40 transition-colors"
                >
                  {dayEvs.map(ev => (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onEdit(ev); }}
                      className="absolute inset-x-0.5 top-0.5 text-[10px] text-white px-1.5 py-0.5 rounded truncate z-10 cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: ev.color ?? "#000" }}
                    >
                      {ev.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────
function DayView({ cursor, events, onAdd, onEdit }: { cursor: string; events: CalendarEvent[]; onAdd: () => void; onEdit: (e: CalendarEvent) => void }) {
  const dayEvents = events.filter(e => e.date === cursor);
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-3 border-b border-s-border sticky top-0 bg-s-bg z-10">
        <p className="text-[13px] text-s-muted">
          {dayEvents.length === 0 ? "Sin eventos" : `${dayEvents.length} evento${dayEvents.length > 1 ? "s" : ""}`}
        </p>
        <button onClick={onAdd} className="flex items-center gap-1 text-[12px] text-s-muted hover:text-s-text transition-colors">
          <Plus size={13} /> Añadir
        </button>
      </div>
      {HOURS.map(hour => {
        const hourEvs = dayEvents.filter(e => e.startTime?.startsWith(hour.slice(0,2)));
        return (
          <div key={hour} className="flex min-h-[52px] border-b border-s-border">
            <div className="w-16 text-[11px] text-s-muted text-right pr-4 pt-2 flex-shrink-0">{hour}</div>
            <div className="flex-1 relative py-1 pr-4">
              {hourEvs.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => onEdit(ev)}
                  className="mb-1 px-3 py-1.5 rounded text-[12px] text-white cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: ev.color ?? "#000" }}
                >
                  <span className="font-medium">{ev.title}</span>
                  {ev.startTime && <span className="ml-2 opacity-70">{ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ""}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Year View ─────────────────────────────────────────────────────────────────
function YearView({ cursor, events, onSelectMonth }: { cursor: string; events: CalendarEvent[]; onSelectMonth: (y: number, m: number) => void }) {
  const year = new Date(cursor).getFullYear();
  const todayIso = today();

  return (
    <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {MONTHS_ES.map((name, month) => {
        const first = firstDayOfMonth(year, month);
        const days  = daysInMonth(year, month);
        const cells: (number | null)[] = Array(first).fill(null);
        for (let d = 1; d <= days; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={month} onClick={() => onSelectMonth(year, month)} className="cursor-pointer group">
            <p className="text-[12px] font-medium text-s-text mb-2 group-hover:text-s-accent transition-colors">{name}</p>
            <div className="grid grid-cols-7 gap-px">
              {DAYS_ES.map(d => (
                <div key={d} className="text-[8px] text-s-muted text-center">{d[0]}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const iso = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const hasEvent = events.some(e => e.date === iso);
                const isToday  = iso === todayIso;
                return (
                  <div key={i} className="flex items-center justify-center">
                    <span className={`text-[9px] w-4 h-4 flex items-center justify-center rounded-full ${
                      isToday ? "bg-s-accent text-white" :
                      hasEvent ? "bg-s-border text-s-text font-medium" : "text-s-muted"
                    }`}>
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Event Modal ───────────────────────────────────────────────────────────────
function EventModal({ date, event, onClose, onSave, onDelete }: {
  date: string; event?: CalendarEvent;
  onClose: () => void; onSave: () => void; onDelete: () => void;
}) {
  const [title, setTitle]       = useState(event?.title ?? "");
  const [selDate, setSelDate]   = useState(event?.date ?? date);
  const [start, setStart]       = useState(event?.startTime ?? "");
  const [end, setEnd]           = useState(event?.endTime ?? "");
  const [desc, setDesc]         = useState(event?.description ?? "");
  const [color, setColor]       = useState(event?.color ?? "#000000");

  const save = () => {
    if (!title.trim()) return;
    if (event) {
      eventsDB.update(event.id, { title, date: selDate, startTime: start || undefined, endTime: end || undefined, description: desc || undefined, color });
    } else {
      eventsDB.create({ title, date: selDate, startTime: start || undefined, endTime: end || undefined, description: desc || undefined, color });
    }
    onSave();
  };

  const del = () => {
    if (!event) return;
    if (confirm("¿Eliminar evento?")) { eventsDB.delete(event.id); onDelete(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-s-bg border border-s-border rounded-xl w-full max-w-md shadow-none">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-s-border">
          <h3 className="text-[14px] font-medium text-s-text">{event ? "Editar evento" : "Nuevo evento"}</h3>
          <button onClick={onClose} className="text-s-muted hover:text-s-text"><X size={16} /></button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título del evento"
            className="w-full border-b border-s-border py-2 text-[14px] text-s-text bg-transparent outline-none placeholder:text-s-muted"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-s-muted uppercase tracking-wider">Fecha</label>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                className="w-full mt-1 border border-s-border rounded px-2 py-1.5 text-[12px] text-s-text bg-s-surface outline-none focus:border-s-text" />
            </div>
            <div>
              <label className="text-[10px] text-s-muted uppercase tracking-wider">Color</label>
              <div className="flex gap-1.5 mt-1.5">
                {EVENT_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-offset-1 ring-s-border" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-s-muted uppercase tracking-wider">Inicio</label>
              <input type="time" value={start} onChange={e => setStart(e.target.value)}
                className="w-full mt-1 border border-s-border rounded px-2 py-1.5 text-[12px] text-s-text bg-s-surface outline-none focus:border-s-text" />
            </div>
            <div>
              <label className="text-[10px] text-s-muted uppercase tracking-wider">Fin</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                className="w-full mt-1 border border-s-border rounded px-2 py-1.5 text-[12px] text-s-text bg-s-surface outline-none focus:border-s-text" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-s-muted uppercase tracking-wider">Descripción</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Notas opcionales..."
              className="w-full mt-1 border border-s-border rounded px-3 py-2 text-[12px] text-s-text bg-s-surface outline-none resize-none focus:border-s-text placeholder:text-s-muted" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-s-border">
          {event ? (
            <button onClick={del} className="flex items-center gap-1.5 text-[12px] text-s-danger hover:opacity-70 transition-opacity">
              <Trash2 size={13} /> Eliminar
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 border border-s-border rounded text-[12px] text-s-muted hover:text-s-text transition-colors">
              Cancelar
            </button>
            <button onClick={save} disabled={!title.trim()}
              className="px-4 py-1.5 bg-s-accent text-white rounded text-[12px] hover:opacity-80 transition-opacity disabled:opacity-30">
              {event ? "Guardar" : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
