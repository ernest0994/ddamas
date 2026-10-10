import { useEffect, useMemo, useState } from "react";
import { chooseMove } from "@/lib/damas/ai";
import {
  countPieces,
  createStatus,
  isDark,
  legalMoves,
  step,
  type Move,
  type Pos,
  type Side,
  type Status,
} from "@/lib/damas/rules";
import { Cap } from "./Cap";
import { COUNTRIES, countryName, type CountryId } from "./flags";

const SAVE = "ddamas-v1";

type Mode = "ai" | "hotseat";

type Save = {
  you: CountryId;
  them: CountryId;
  mode: Mode;
  status: Status;
};

type Flight = {
  move: Move;
  remember: boolean;
  hop: number;
  fromStatus: Status;
};

function same(a: Pos, b: Pos) {
  return a.r === b.r && a.c === b.c;
}

let audio: AudioContext | null = null;

function blip(freq: number) {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audio = audio ?? new Ctx();
  if (audio.state === "suspended") void audio.resume();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.value = 0.045;
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.09);
  osc.stop(audio.currentTime + 0.1);
}

export function Game() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<"home" | "play">("home");
  const [you, setYou] = useState<CountryId>("do");
  const [them, setThem] = useState<CountryId>("pr");
  const [mode, setMode] = useState<Mode>("ai");
  const [status, setStatus] = useState<Status>(() => createStatus());
  const [past, setPast] = useState<Status[]>([]);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [preview, setPreview] = useState<Move | null>(null);
  const [note, setNote] = useState("");
  const [rules, setRules] = useState(false);
  const [crowned, setCrowned] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [glide, setGlide] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE);
      if (raw) {
        const saved = JSON.parse(raw) as Save;
        setYou(saved.you);
        setThem(saved.them);
        setMode(saved.mode);
        setStatus(saved.status);
        setScreen("play");
      }
    } catch {
      /* a bad save just starts fresh */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || screen !== "play") return;
    const payload: Save = { you, them, mode, status };
    localStorage.setItem(SAVE, JSON.stringify(payload));
  }, [ready, screen, you, them, mode, status]);

  const moves = useMemo(
    () => (status.winner ? [] : legalMoves(status.board, status.turn)),
    [status],
  );
  const human = (mode === "hotseat" || status.turn === "gold") && !flight;
  const thinking = screen === "play" && mode === "ai" && status.turn === "silver" && !status.winner && !flight;

  useEffect(() => {
    if (!flight) {
      setGlide(false);
      return;
    }
    if (!glide) {
      const frame = requestAnimationFrame(() => setGlide(true));
      return () => cancelAnimationFrame(frame);
    }
    const last = flight.move.path.length - 1;
    if (flight.hop < last) {
      const wait = flight.hop === 0 ? 30 : 460;
      const timer = window.setTimeout(() => {
        if (flight.move.captures[flight.hop]) blip(190);
        else blip(340);
        setFlight((current) => (current ? { ...current, hop: current.hop + 1 } : current));
      }, wait);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const { move, remember, fromStatus } = flight;
      if (remember) setPast((stack) => [...stack, fromStatus].slice(-40));
      setStatus(step(fromStatus, move));
      setFlight(null);
      setGlide(false);
      if (move.promote) {
        setCrowned(`${move.to.r}-${move.to.c}`);
        setNote("Dama.");
        blip(620);
      } else if (move.captures.length > 0) {
        const n = move.captures.length;
        const mine = fromStatus.turn === "gold";
        setNote(mode === "hotseat" ? `Come ${n}.` : mine ? `Comiste ${n}.` : `Te comieron ${n}.`);
      } else {
        setNote("");
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(move.captures.length > 1 ? [10, 40, 10] : 12);
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [flight, glide, mode]);

  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => {
      const move = chooseMove(status.board, "silver");
      if (!move) return;
      commit(move, false);
    }, 420);
    return () => clearTimeout(timer);
    // commit is stable enough for this turn; status identity gates the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking, status]);

  function begin(nextMode: Mode) {
    const fresh = createStatus();
    setMode(nextMode);
    setStatus(fresh);
    setPast([]);
    setSelected(null);
    setPreview(null);
    setNote(nextMode === "ai" ? "Oro sale. Te toca." : "Oro sale.");
    setScreen("play");
    localStorage.setItem(SAVE, JSON.stringify({ you, them, mode: nextMode, status: fresh }));
  }

  function commit(move: Move, remember: boolean) {
    if (flight) return;
    setSelected(null);
    setPreview(null);
    setFlight({ move, remember, hop: 0, fromStatus: status });
  }

  function undo() {
    if (flight) return;
    setPast((stack) => {
      const copy = [...stack];
      const prev = copy.pop();
      if (prev) {
        setStatus(prev);
        setSelected(null);
        setPreview(null);
        setNote("");
      }
      return copy;
    });
  }

  function quit() {
    localStorage.removeItem(SAVE);
    setScreen("home");
    setPast([]);
    setSelected(null);
    setPreview(null);
  }

  function onSquare(r: number, c: number) {
    if (!human || status.winner) return;
    const here = selected
      ? moves.filter((move) => same(move.from, selected) && move.to.r === r && move.to.c === c)
      : [];
    if (here.length === 1) {
      commit(here[0], true);
      return;
    }
    if (here.length > 1) {
      const index = preview ? here.findIndex((move) => move === preview) : -1;
      const next = here[(index + 1) % here.length];
      if (preview && same(preview.to, next.to) && index >= 0 && next === preview) {
        commit(next, true);
        return;
      }
      setPreview(next);
      setNote("Hay otra comida. Toca otra vez o pulsa Comer así.");
      return;
    }
    const piece = status.board[r][c];
    if (piece && piece.side === status.turn && moves.some((move) => same(move.from, { r, c }))) {
      setSelected({ r, c });
      setPreview(null);
      if (moves.some((move) => move.captures.length > 0)) setNote("Tienes que comer.");
      return;
    }
    setSelected(null);
    setPreview(null);
  }

  if (!ready) return <main className="wood-app" />;

  if (screen === "home") {
    return (
      <main className="wood-app">
        <div className="stage">
          <header className="home-head">
            <p className="eyebrow">Chapas</p>
            <h1>DDamas</h1>
            <p className="lede">Damas dominicanas. La ficha es la chapa. La dama es esa misma chapa, volteada.</p>
          </header>
          <p className="side-rule">Oro sale primero. Tú llevas la falda de oro. La otra lleva plata. La bandera es el dibujo, no el lado.</p>
          <Picker label="Tú" hint="Falda de oro" metal="gold" value={you} onChange={setYou} />
          <Picker label="La otra" hint="Falda de plata" metal="silver" value={them} onChange={setThem} />
          <div className="home-actions">
            <button type="button" className="btn primary" onClick={() => begin("ai")}>
              Contra la máquina
            </button>
            <button type="button" className="btn ghost" onClick={() => begin("hotseat")}>
              Los dos en el teléfono
            </button>
          </div>
        </div>
      </main>
    );
  }

  const goldName = countryName(you);
  const silverName = countryName(them);
  const flipped = mode === "hotseat" && status.turn === "silver" && !status.winner;
  const selectedMoves = selected ? moves.filter((move) => same(move.from, selected)) : [];
  const mustCapture = moves.some((move) => move.captures.length > 0);

  let turnText = status.turn === "gold" ? goldName : silverName;
  if (status.winner === "draw") turnText = "Tablas";
  else if (status.winner === "gold") turnText = mode === "ai" ? "Ganaste" : `Ganó ${goldName}`;
  else if (status.winner === "silver") turnText = mode === "ai" ? "Perdiste" : `Ganó ${silverName}`;
  else if (thinking) turnText = "La máquina piensa";
  else if (mode === "ai" && status.turn === "gold") turnText = "Te toca";
  else if (mode === "hotseat") turnText = status.turn === "gold" ? `Oro · ${goldName}` : `Plata · ${silverName}`;

  return (
    <main className="wood-app play">
      <header className="play-head">
        <SideScore metal="gold" label="Oro" country={you} count={countPieces(status.board, "gold")} active={status.turn === "gold" && !status.winner} />
        <div className="turn-block">
          <strong>{turnText}</strong>
          <span>{note || (mustCapture && human ? "Tienes que comer." : "\u00a0")}</span>
        </div>
        <SideScore metal="silver" label="Plata" country={them} count={countPieces(status.board, "silver")} active={status.turn === "silver" && !status.winner} />
      </header>

      <div className={`board-wrap ${flipped ? "is-flipped" : ""}`}>
        <div className="board" role="grid" aria-label="Tablero de damas">
          {status.board.map((row, r) =>
            row.map((piece, c) => {
              const dark = isDark(r, c);
              const here = { r, c };
              const isDest = selectedMoves.some((move) => same(move.to, here));
              const isSel = selected ? same(selected, here) : false;
              const victims = preview?.captures.some((pos) => same(pos, here));
              const gone =
                flight?.move.captures.some((cap, index) => index < flight.hop - 1 && same(cap, here)) ||
                (flight ? same(flight.move.from, here) : false);
              const eating = flight?.move.captures.some((cap, index) => index === flight.hop - 1 && same(cap, here));
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  className={`sq ${dark ? "dark" : "light"} ${isSel ? "sel" : ""} ${isDest ? "dest" : ""} ${victims ? "victim" : ""}`}
                  onClick={() => onSquare(r, c)}
                  aria-label={piece ? `${piece.kind === "king" ? "dama" : "ficha"} ${piece.side}` : dark ? "casilla" : "clara"}
                >
                  {piece && !gone ? (
                    <span className={eating ? "is-eaten" : undefined}>
                      <Cap
                        country={piece.side === "gold" ? you : them}
                        metal={piece.side}
                        king={piece.kind === "king"}
                        lift={isSel}
                        crowned={crowned === `${r}-${c}` && piece.kind === "king"}
                      />
                    </span>
                  ) : isDest ? (
                    <i className="dot" />
                  ) : null}
                </button>
              );
            }),
          )}
          {flight ? (
            <div
              className={`traveler ${glide ? "go" : ""}`}
              style={{
                left: `${flight.move.path[flight.hop].c * 10}%`,
                top: `${flight.move.path[flight.hop].r * 10}%`,
              }}
            >
              <Cap
                country={flight.fromStatus.turn === "gold" ? you : them}
                metal={flight.fromStatus.turn}
                king={
                  flight.fromStatus.board[flight.move.from.r][flight.move.from.c]?.kind === "king" ||
                  (flight.move.promote && flight.hop === flight.move.path.length - 1)
                }
                crowned={flight.move.promote && flight.hop === flight.move.path.length - 1}
              />
            </div>
          ) : null}
        </div>
      </div>

      {preview ? (
        <button type="button" className="btn primary slim" onClick={() => commit(preview, true)}>
          Comer así
        </button>
      ) : null}

      <footer className="play-foot">
        <button type="button" className="btn ghost" onClick={undo} disabled={past.length === 0 || !!flight}>
          Deshacer
        </button>
        <button type="button" className="btn ghost" onClick={() => setRules(true)}>
          Reglas
        </button>
        <button type="button" className="btn ghost" onClick={quit}>
          Mesa nueva
        </button>
      </footer>

      {rules ? (
        <div className="sheet" role="dialog" aria-label="Reglas">
          <div className="sheet-card">
            <h2>Cómo se juega</h2>
            <div className="legend">
              <div>
                <Cap country={you} metal="gold" king={false} />
                <span>Oro</span>
              </div>
              <div>
                <Cap country={them} metal="silver" king={false} />
                <span>Plata</span>
              </div>
              <div>
                <Cap country={you} metal="gold" king />
                <span>Dama</span>
              </div>
            </div>
            <ul>
              <li>La ficha camina en diagonal, una casilla, hacia adelante.</li>
              <li>Come hacia adelante y hacia atrás. Si puedes comer, tienes que comer.</li>
              <li>Si hay varias comidas, se juega la que más come.</li>
              <li>Lo comido se queda hasta que la cadena termina.</li>
              <li>Si la ficha se detiene en la última fila, se voltea. Esa es la dama, y vuela.</li>
              <li>Pasar por la última fila sin detenerse no corona.</li>
            </ul>
            <button type="button" className="btn primary" onClick={() => setRules(false)}>
              Volver a la mesa
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Picker({
  label,
  hint,
  metal,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  metal: Side;
  value: CountryId;
  onChange: (id: CountryId) => void;
}) {
  return (
    <section className={`picker ${metal}`}>
      <h2>{label}</h2>
      <p className="hint">{hint}</p>
      <div className="picker-row">
        {COUNTRIES.map((country) => (
          <button
            key={country.id}
            type="button"
            className={country.id === value ? "on" : ""}
            onClick={() => onChange(country.id)}
            aria-pressed={country.id === value}
            aria-label={country.name}
          >
            <Cap country={country.id} metal={metal} king={false} />
            <span>{country.short}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SideScore({
  metal,
  label,
  country,
  count,
  active,
}: {
  metal: Side;
  label: string;
  country: CountryId;
  count: number;
  active: boolean;
}) {
  return (
    <div className={`score ${metal} ${active ? "on" : ""}`}>
      <Cap country={country} metal={metal} king={false} />
      <b>{count}</b>
      <small>{label}</small>
    </div>
  );
}
