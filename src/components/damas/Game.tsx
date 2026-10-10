import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useP2PRoom, type PeerInfo } from "@/lib/multiplayer";
import { Cap } from "./Cap";
import { COUNTRIES, countryName, type CountryId } from "./flags";
import { playCap, primeCaps } from "@/lib/damas/sounds";

const SAVE = "ddamas-v1";

type Mode = "ai" | "hotseat" | "online";
type Screen = "home" | "table" | "play";

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

type NetHello = {
  t: "hello";
  you: CountryId;
  them: CountryId;
  status: Status;
  pending?: Move | null;
};

function same(a: Pos, b: Pos) {
  return a.r === b.r && a.c === b.c;
}

function sameMove(a: Move, b: Move) {
  return (
    same(a.from, b.from) &&
    same(a.to, b.to) &&
    a.captures.length === b.captures.length &&
    a.captures.every((cap, index) => same(cap, b.captures[index]))
  );
}

function freshCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function isCountry(value: unknown): value is CountryId {
  return COUNTRIES.some((country) => country.id === value);
}

function isMove(value: unknown): value is Move {
  if (!value || typeof value !== "object") return false;
  const move = value as Move;
  return Boolean(move.from && move.to && Array.isArray(move.captures) && Array.isArray(move.path));
}

function isStatus(value: unknown): value is Status {
  if (!value || typeof value !== "object") return false;
  const status = value as Status;
  if (!Array.isArray(status.board) || status.board.length !== 10) return false;
  if (status.turn !== "gold" && status.turn !== "silver") return false;
  return status.board.every((row) => Array.isArray(row) && row.length === 10);
}

export function Game() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
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
  const [link, setLink] = useState<null | { code: string; role: "host" | "guest" }>(null);
  const [draft, setDraft] = useState("");
  const [joinError, setJoinError] = useState("");
  const [peerState, setPeerState] = useState<"wait" | "ok" | "fail">("wait");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const sendRef = useRef<(data: unknown) => void>(() => {});
  const statusRef = useRef(status);
  const flightRef = useRef(flight);
  const queueRef = useRef<Move[]>([]);
  const earlyRef = useRef<Move[]>([]);
  const greeted = useRef(false);
  const acked = useRef(false);
  const linkRef = useRef(link);
  const youRef = useRef(you);
  const themRef = useRef(them);
  const peersRef = useRef(peers);
  const onNetRef = useRef<(data: unknown) => void>(() => {});
  statusRef.current = status;
  flightRef.current = flight;
  linkRef.current = link;
  youRef.current = you;
  themRef.current = them;
  peersRef.current = peers;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE);
      if (raw) {
        const saved = JSON.parse(raw) as Save;
        if (saved.mode === "online") return;
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
    if (!ready || screen !== "play" || mode === "online") return;
    const payload: Save = { you, them, mode, status };
    localStorage.setItem(SAVE, JSON.stringify(payload));
  }, [ready, screen, you, them, mode, status]);

  const moves = useMemo(
    () => (status.winner ? [] : legalMoves(status.board, status.turn)),
    [status],
  );
  const mySide: Side = link?.role === "guest" ? "silver" : "gold";
  const human =
    !flight &&
    (mode === "hotseat" ||
      (mode === "ai" && status.turn === "gold") ||
      (mode === "online" && status.turn === mySide && (link?.role !== "guest" || peerState === "ok")));
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
    const timers: number[] = [];
    if (flight.hop > 0 && !(flight.move.promote && flight.hop === last)) {
      timers.push(
        window.setTimeout(() => {
          if (flight.move.captures[flight.hop - 1]) playCap("take");
          else playCap("step");
        }, 400),
      );
    }
    if (flight.hop < last) {
      timers.push(
        window.setTimeout(() => {
          setFlight((current) => (current ? { ...current, hop: current.hop + 1 } : current));
        }, flight.hop === 0 ? 30 : 460),
      );
    } else {
      timers.push(
        window.setTimeout(() => {
          const { move, remember, fromStatus } = flight;
          if (remember) setPast((stack) => [...stack, fromStatus].slice(-40));
          setStatus(step(fromStatus, move));
          flightRef.current = null;
          setFlight(null);
          setGlide(false);
          if (move.promote) {
            setCrowned(`${move.to.r}-${move.to.c}`);
            setNote("Dama.");
            playCap("crown");
          } else if (move.captures.length > 0) {
            const n = move.captures.length;
            const mine = mode === "online" ? fromStatus.turn === mySide : fromStatus.turn === "gold";
            setNote(mode === "hotseat" ? `Come ${n}.` : mine ? `Comiste ${n}.` : `Te comieron ${n}.`);
          } else {
            setNote("");
          }
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(move.captures.length > 1 ? [10, 40, 10] : 12);
          }
        }, 420),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [flight, glide, mode, mySide]);

  useEffect(() => {
    const unlock = () => primeCaps();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (flight) return;
    let guard = 0;
    while (queueRef.current.length && guard++ < 8) {
      const next = queueRef.current.shift();
      if (!next) break;
      const legal = legalMoves(statusRef.current.board, statusRef.current.turn);
      const found = legal.find((move) => sameMove(move, next));
      if (found) {
        commit(found, false);
        return;
      }
    }
    // commit is the local function; status/flight are the gates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, status]);

  useEffect(() => {
    if (screen !== "play" || mode !== "online") return;
    const timer = window.setInterval(() => {
      const linkNow = linkRef.current;
      if (!linkNow) return;
      const list = peersRef.current;
      const connected = list.some((peer) => peer.connectionState === "connected");
      const failed = list.length > 0 && list.every((peer) => peer.connectionState === "failed");
      if (linkNow.role === "host") {
        setPeerState(connected ? "ok" : failed ? "fail" : "wait");
        if (!connected || acked.current) return;
        const flying = flightRef.current;
        const hello: NetHello = {
          t: "hello",
          you: youRef.current,
          them: themRef.current,
          status: statusRef.current,
          pending: flying?.remember ? flying.move : null,
        };
        sendRef.current(hello);
        return;
      }
      if (!greeted.current) setPeerState(failed ? "fail" : "wait");
      else if (!connected && failed) setPeerState("fail");
      else if (!connected) setPeerState("wait");
      else setPeerState("ok");
    }, 600);
    return () => window.clearInterval(timer);
  }, [screen, mode]);

  const peerIdRef = useRef("");
  useEffect(() => {
    const id = peers.find((peer) => peer.connectionState === "connected")?.id ?? "";
    if (id === peerIdRef.current) return;
    peerIdRef.current = id;
    acked.current = false;
  }, [peers]);

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
    primeCaps();
    const fresh = createStatus();
    setLink(null);
    setMode(nextMode);
    setStatus(fresh);
    setPast([]);
    setSelected(null);
    setPreview(null);
    setFlight(null);
    flightRef.current = null;
    queueRef.current = [];
    earlyRef.current = [];
    greeted.current = false;
    acked.current = false;
    setNote(nextMode === "ai" ? "Oro sale. Te toca." : "Oro sale.");
    setScreen("play");
    localStorage.setItem(SAVE, JSON.stringify({ you, them, mode: nextMode, status: fresh }));
  }

  function openTable() {
    primeCaps();
    setJoinError("");
    setScreen("table");
  }

  function createTable() {
    primeCaps();
    const code = freshCode();
    const fresh = createStatus();
    localStorage.removeItem(SAVE);
    setLink({ code, role: "host" });
    setMode("online");
    setStatus(fresh);
    setPast([]);
    setSelected(null);
    setPreview(null);
    setFlight(null);
    flightRef.current = null;
    queueRef.current = [];
    earlyRef.current = [];
    greeted.current = false;
    acked.current = false;
    peerIdRef.current = "";
    setPeerState("wait");
    setPeers([]);
    setNote("Oro sale. Pásale el código.");
    setScreen("play");
  }

  function joinTable() {
    primeCaps();
    const code = draft.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length < 4) {
      setJoinError("El código tiene 4 letras.");
      return;
    }
    const fresh = createStatus();
    localStorage.removeItem(SAVE);
    setLink({ code, role: "guest" });
    setMode("online");
    setStatus(fresh);
    setPast([]);
    setSelected(null);
    setPreview(null);
    setFlight(null);
    flightRef.current = null;
    queueRef.current = [];
    earlyRef.current = [];
    greeted.current = false;
    acked.current = false;
    peerIdRef.current = "";
    setPeerState("wait");
    setPeers([]);
    setJoinError("");
    setNote("Entrando a la mesa…");
    setScreen("play");
  }

  function commit(move: Move, remember: boolean) {
    if (flightRef.current) {
      if (!remember) queueRef.current.push(move);
      return;
    }
    if (mode === "online" && remember) sendRef.current({ t: "move", move });
    setSelected(null);
    setPreview(null);
    const next = { move, remember, hop: 0, fromStatus: statusRef.current };
    flightRef.current = next;
    setFlight(next);
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
    setFlight(null);
    flightRef.current = null;
    setLink(null);
    setMode("ai");
    setPeerState("wait");
    setPeers([]);
    queueRef.current = [];
    earlyRef.current = [];
    greeted.current = false;
    acked.current = false;
    peerIdRef.current = "";
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

  onNetRef.current = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const msg = data as { t?: string; move?: unknown; you?: unknown; them?: unknown; status?: unknown; pending?: unknown };
    if (msg.t === "ack") {
      acked.current = true;
      return;
    }
    if (msg.t === "hello") {
      if (linkRef.current?.role !== "guest") return;
      if (greeted.current) {
        sendRef.current({ t: "ack" });
        return;
      }
      if (!isStatus(msg.status) || !isCountry(msg.you) || !isCountry(msg.them)) return;
      greeted.current = true;
      const queued = [...earlyRef.current];
      earlyRef.current = [];
      queueRef.current = [];
      if (isMove(msg.pending)) queueRef.current.push(msg.pending);
      for (const move of queued) if (isMove(move)) queueRef.current.push(move);
      statusRef.current = msg.status;
      setYou(msg.you);
      setThem(msg.them);
      setStatus(msg.status);
      setPast([]);
      setSelected(null);
      setPreview(null);
      setPeerState("ok");
      setNote(msg.status.turn === "silver" ? "Te toca." : "Oro sale.");
      sendRef.current({ t: "ack" });
      return;
    }
    if (msg.t === "move" && isMove(msg.move)) {
      if (linkRef.current?.role === "guest" && !greeted.current) {
        earlyRef.current.push(msg.move);
        return;
      }
      const legal = legalMoves(statusRef.current.board, statusRef.current.turn);
      const found = legal.find((move) => sameMove(move, msg.move as Move));
      if (found) commit(found, false);
    }
  };

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
            <button type="button" className="btn ghost" onClick={openTable}>
              Mesa con alguien
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "table") {
    return (
      <main className="wood-app">
        <div className="stage">
          <header className="home-head">
            <p className="eyebrow">En línea</p>
            <h1>Una mesa</h1>
            <p className="lede">Tú llevas oro y sales. La otra persona lleva plata. Pásale el código, o entra al suyo.</p>
          </header>
          <div className="home-actions">
            <button type="button" className="btn primary" onClick={createTable}>
              Crear mesa
            </button>
          </div>
          <div className="code-row">
            <input
              className="code-input"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4));
                setJoinError("");
              }}
              placeholder="CÓDIGO"
              aria-label="Código de la mesa"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={4}
              onKeyDown={(event) => {
                if (event.key === "Enter") joinTable();
              }}
            />
            <button type="button" className="btn primary" onClick={joinTable}>
              Entrar
            </button>
          </div>
          {joinError ? <p className="join-error">{joinError}</p> : null}
          <div className="home-actions">
            <button type="button" className="btn ghost" onClick={() => setScreen("home")}>
              Volver
            </button>
          </div>
        </div>
      </main>
    );
  }

  const goldName = countryName(you);
  const silverName = countryName(them);
  const flipped =
    (mode === "online" && link?.role === "guest") ||
    (mode === "hotseat" && status.turn === "silver" && !status.winner);
  const selectedMoves = selected ? moves.filter((move) => same(move.from, selected)) : [];
  const mustCapture = moves.some((move) => move.captures.length > 0);

  let turnText = status.turn === "gold" ? goldName : silverName;
  if (status.winner === "draw") turnText = "Tablas";
  else if (status.winner === "gold") turnText = mode === "ai" ? "Ganaste" : `Ganó ${goldName}`;
  else if (status.winner === "silver") turnText = mode === "ai" ? "Perdiste" : `Ganó ${silverName}`;
  else if (thinking) turnText = "La máquina piensa";
  else if (mode === "ai" && status.turn === "gold") turnText = "Te toca";
  else if (mode === "hotseat") turnText = status.turn === "gold" ? `Oro · ${goldName}` : `Plata · ${silverName}`;
  else if (mode === "online" && link?.role === "guest" && peerState !== "ok") turnText = peerState === "fail" ? "Sin conexión" : "Entrando";
  else if (mode === "online" && peerState === "wait") turnText = "Esperando";
  else if (mode === "online" && peerState === "fail") turnText = "Sin conexión";
  else if (mode === "online" && status.turn === mySide) turnText = "Te toca";
  else if (mode === "online") turnText = "Le toca";

  const guestWait = mode === "online" && link?.role === "guest" && peerState !== "ok";

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

      {mode === "online" && link ? (
        <div className="room-banner">
          <span>{link.role === "host" ? "Tu mesa" : "Mesa"}</span>
          <strong>{link.code}</strong>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const code = link.code;
              void navigator.clipboard?.writeText(code).then(
                () => setNote("Código copiado."),
                () => setNote(code),
              );
            }}
          >
            Copiar
          </button>
        </div>
      ) : null}

      {guestWait ? (
        <div className="wait-card">
          <p className="eyebrow">Plata</p>
          <strong className="code-big">{link?.code}</strong>
          <p>
            {peerState === "fail"
              ? "No se pudo conectar. Revisa el código o crea otra mesa."
              : "Esperando a quien creó la mesa…"}
          </p>
        </div>
      ) : (
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
                  data-rc={`${r}-${c}`}
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
      )}

      {preview ? (
        <button type="button" className="btn primary slim" onClick={() => commit(preview, true)}>
          Comer así
        </button>
      ) : null}

      <footer className="play-foot">
        <button type="button" className="btn ghost" onClick={undo} disabled={past.length === 0 || !!flight || mode === "online"}>
          Deshacer
        </button>
        <button type="button" className="btn ghost" onClick={() => setRules(true)}>
          Reglas
        </button>
        <button type="button" className="btn ghost" onClick={quit}>
          Mesa nueva
        </button>
      </footer>

      {link && screen === "play" ? (
        <RoomBridge
          code={link.code}
          role={link.role}
          sendRef={sendRef}
          onPeers={setPeers}
          onNetRef={onNetRef}
        />
      ) : null}

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

function RoomBridge({
  code,
  role,
  sendRef,
  onPeers,
  onNetRef,
}: {
  code: string;
  role: "host" | "guest";
  sendRef: { current: (data: unknown) => void };
  onPeers: (peers: PeerInfo[]) => void;
  onNetRef: { current: (data: unknown) => void };
}) {
  const linkRoom = useP2PRoom({ room: `ddamas-${code}`, name: role });
  useEffect(() => {
    sendRef.current = linkRoom.send;
  }, [linkRoom.send, sendRef]);
  useEffect(() => linkRoom.onMessage((_from, data) => onNetRef.current(data)), [linkRoom.onMessage, onNetRef]);
  useEffect(() => {
    onPeers(linkRoom.peers);
  }, [linkRoom.peers, onPeers]);
  return null;
}
