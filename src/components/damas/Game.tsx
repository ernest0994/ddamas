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
type Screen = "home" | "table" | "seat" | "play";

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
  hostSide: Side;
  status: Status;
  pending?: Move | null;
};

type Skirt = Side | "steel";

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
  const [mine, setMine] = useState<CountryId>("do");
  const [theirFlag, setTheirFlag] = useState<CountryId | null>(null);
  const [myClaim, setMyClaim] = useState<Side | null>(null);
  const [theirClaim, setTheirClaim] = useState<Side | null>(null);
  const [onlineSide, setOnlineSide] = useState<Side | null>(null);
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
  const mineRef = useRef(mine);
  const theirFlagRef = useRef(theirFlag);
  const myClaimRef = useRef(myClaim);
  const onlineSideRef = useRef(onlineSide);
  const seatedRef = useRef(false);
  const peersRef = useRef(peers);
  const onNetRef = useRef<(data: unknown) => void>(() => {});
  statusRef.current = status;
  flightRef.current = flight;
  linkRef.current = link;
  youRef.current = you;
  themRef.current = them;
  mineRef.current = mine;
  theirFlagRef.current = theirFlag;
  myClaimRef.current = myClaim;
  onlineSideRef.current = onlineSide;
  seatedRef.current = onlineSide !== null;
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
  const mySide: Side = onlineSide ?? "gold";
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
    if ((screen !== "seat" && screen !== "play") || mode !== "online") return;
    const timer = window.setInterval(() => {
      const linkNow = linkRef.current;
      if (!linkNow) return;
      const list = peersRef.current;
      const connected = list.some((peer) => peer.connectionState === "connected");
      const failed = list.length > 0 && list.every((peer) => peer.connectionState === "failed");
      if (!seatedRef.current) {
        setPeerState(connected ? "ok" : failed ? "fail" : "wait");
        if (!connected) return;
        sendRef.current({ t: "sit", country: mineRef.current, claim: myClaimRef.current });
        return;
      }
      if (linkNow.role === "host") {
        setPeerState(connected ? "ok" : failed ? "fail" : "wait");
        if (!connected || acked.current) return;
        const flying = flightRef.current;
        const hello: NetHello = {
          t: "hello",
          you: youRef.current,
          them: themRef.current,
          hostSide: onlineSideRef.current === "silver" ? "silver" : "gold",
          status: statusRef.current,
          pending: flying?.remember ? flying.move : null,
        };
        sendRef.current(hello);
        return;
      }
      if (!connected && failed) setPeerState("fail");
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
    if (!id && !seatedRef.current) {
      setTheirFlag(null);
      setTheirClaim(null);
    }
  }, [peers]);

  useEffect(() => {
    if (link?.role !== "host" || seatedRef.current || onlineSide) return;
    if (!theirFlag || !myClaim || !theirClaim || myClaim === theirClaim) return;
    const goldRole = myClaim === "gold" ? "host" : "guest";
    sendRef.current({ t: "deal", gold: goldRole, hostFlag: mineRef.current, guestFlag: theirFlag });
    applyDeal(goldRole, mineRef.current, theirFlag);
    // The host closes the table so both phones get the same oro and plata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, myClaim, theirClaim, theirFlag, mine, onlineSide]);

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
    setOnlineSide(null);
    seatedRef.current = false;
    setNote(nextMode === "ai" ? "Oro sale. Te toca." : "Oro sale.");
    setScreen("play");
    localStorage.setItem(SAVE, JSON.stringify({ you, them, mode: nextMode, status: fresh }));
  }

  function openTable() {
    primeCaps();
    setJoinError("");
    setMine(you);
    mineRef.current = you;
    setTheirFlag(null);
    setTheirClaim(null);
    setMyClaim(null);
    myClaimRef.current = null;
    setOnlineSide(null);
    seatedRef.current = false;
    setScreen("table");
  }

  function resetOnlineSeat() {
    setTheirFlag(null);
    theirFlagRef.current = null;
    setTheirClaim(null);
    setMyClaim(null);
    myClaimRef.current = null;
    setOnlineSide(null);
    seatedRef.current = false;
    greeted.current = false;
    acked.current = false;
    peerIdRef.current = "";
    setPeerState("wait");
    setPeers([]);
    queueRef.current = [];
    earlyRef.current = [];
  }

  function createTable() {
    primeCaps();
    const code = freshCode();
    localStorage.removeItem(SAVE);
    setLink({ code, role: "host" });
    setMode("online");
    resetOnlineSeat();
    setFlight(null);
    flightRef.current = null;
    setPast([]);
    setSelected(null);
    setPreview(null);
    setNote("");
    setScreen("seat");
  }

  function joinTable() {
    primeCaps();
    const code = draft.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length < 4) {
      setJoinError("El código tiene 4 letras.");
      return;
    }
    localStorage.removeItem(SAVE);
    setLink({ code, role: "guest" });
    setMode("online");
    resetOnlineSeat();
    setFlight(null);
    flightRef.current = null;
    setPast([]);
    setSelected(null);
    setPreview(null);
    setJoinError("");
    setNote("");
    setScreen("seat");
  }

  function lockSides(side: Side, myFlag: CountryId, otherFlag: CountryId) {
    if (seatedRef.current) return;
    seatedRef.current = true;
    const goldFlag = side === "gold" ? myFlag : otherFlag;
    const silverFlag = side === "gold" ? otherFlag : myFlag;
    const fresh = createStatus();
    const queued = earlyRef.current.filter(isMove);
    earlyRef.current = [];
    queueRef.current = queued;
    setOnlineSide(side);
    onlineSideRef.current = side;
    setYou(goldFlag);
    setThem(silverFlag);
    youRef.current = goldFlag;
    themRef.current = silverFlag;
    setStatus(fresh);
    statusRef.current = fresh;
    setPast([]);
    setSelected(null);
    setPreview(null);
    setFlight(null);
    flightRef.current = null;
    greeted.current = true;
    setPeerState("ok");
    setNote(side === "gold" ? "Oro sale. Te toca." : "Sales de plata. Ellos mueven primero.");
    setScreen("play");
  }

  function applyDeal(goldRole: "host" | "guest", hostFlag: CountryId, guestFlag: CountryId) {
    const role = linkRef.current?.role;
    if (!role || seatedRef.current || !isCountry(hostFlag) || !isCountry(guestFlag)) return;
    const side: Side = role === goldRole ? "gold" : "silver";
    const myFlag = role === "host" ? hostFlag : guestFlag;
    const otherFlag = role === "host" ? guestFlag : hostFlag;
    lockSides(side, myFlag, otherFlag);
  }

  function sorteo() {
    const linkNow = linkRef.current;
    const other = theirFlagRef.current;
    if (!linkNow || !other || seatedRef.current) return;
    if (linkNow.role === "guest") {
      sendRef.current({ t: "sorteo" });
      return;
    }
    const goldRole = Math.random() < 0.5 ? "host" : "guest";
    sendRef.current({ t: "deal", gold: goldRole, hostFlag: mineRef.current, guestFlag: other });
    applyDeal(goldRole, mineRef.current, other);
  }

  function claimSide(side: Side) {
    setMyClaim(side);
    myClaimRef.current = side;
    if (!seatedRef.current && linkRef.current) {
      sendRef.current({ t: "sit", country: mineRef.current, claim: side });
    }
  }

  function pickMine(id: CountryId) {
    setMine(id);
    mineRef.current = id;
    if (!seatedRef.current && linkRef.current) {
      sendRef.current({ t: "sit", country: id, claim: myClaimRef.current });
    }
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
    setTheirFlag(null);
    setTheirClaim(null);
    setMyClaim(null);
    setOnlineSide(null);
    seatedRef.current = false;
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
    const msg = data as {
      t?: string;
      move?: unknown;
      you?: unknown;
      them?: unknown;
      status?: unknown;
      pending?: unknown;
      hostSide?: unknown;
      country?: unknown;
      claim?: unknown;
      gold?: unknown;
      hostFlag?: unknown;
      guestFlag?: unknown;
    };
    if (msg.t === "ack") {
      acked.current = true;
      return;
    }
    if (msg.t === "sit" && isCountry(msg.country)) {
      if (seatedRef.current) return;
      theirFlagRef.current = msg.country;
      setTheirFlag(msg.country);
      setTheirClaim(msg.claim === "gold" || msg.claim === "silver" ? msg.claim : null);
      setPeerState("ok");
      return;
    }
    if (msg.t === "sorteo") {
      if (linkRef.current?.role === "host") sorteo();
      return;
    }
    if (msg.t === "deal" && (msg.gold === "host" || msg.gold === "guest") && isCountry(msg.hostFlag) && isCountry(msg.guestFlag)) {
      applyDeal(msg.gold, msg.hostFlag, msg.guestFlag);
      return;
    }
    if (msg.t === "hello") {
      if (linkRef.current?.role !== "guest") return;
      if (greeted.current) {
        sendRef.current({ t: "ack" });
        return;
      }
      if (!isStatus(msg.status) || !isCountry(msg.you) || !isCountry(msg.them)) return;
      const hostSide: Side = msg.hostSide === "silver" ? "silver" : "gold";
      const mineSide: Side = hostSide === "gold" ? "silver" : "gold";
      greeted.current = true;
      seatedRef.current = true;
      const queued = [...earlyRef.current];
      earlyRef.current = [];
      queueRef.current = [];
      if (isMove(msg.pending)) queueRef.current.push(msg.pending);
      for (const move of queued) if (isMove(move)) queueRef.current.push(move);
      statusRef.current = msg.status;
      onlineSideRef.current = mineSide;
      setOnlineSide(mineSide);
      setYou(msg.you);
      setThem(msg.them);
      youRef.current = msg.you;
      themRef.current = msg.them;
      setStatus(msg.status);
      setPast([]);
      setSelected(null);
      setPreview(null);
      setPeerState("ok");
      setScreen("play");
      setNote(msg.status.turn === mineSide ? "Te toca." : "Le toca.");
      sendRef.current({ t: "ack" });
      return;
    }
    if (msg.t === "move" && isMove(msg.move)) {
      if (!greeted.current) {
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
            <h1>Tu chapa</h1>
            <p className="lede">Cada quien trae la suya. Oro y plata se eligen cuando los dos estén sentados. Oro sale primero.</p>
          </header>
          <Picker label="Tu chapa" hint="La bandera es el dibujo" metal="steel" value={mine} onChange={pickMine} />
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

  let seatView: React.ReactNode = null;
  if (screen === "seat" && link) {
    const readySeat = peerState === "ok" && Boolean(theirFlag);
    const clash = Boolean(myClaim && theirClaim && myClaim === theirClaim);
    const skirt: Skirt = myClaim ?? "steel";
    seatView = (
      <main className="wood-app">
        <div className="stage">
          <header className="home-head">
            <p className="eyebrow">Mesa</p>
            <h1 className="code-big">{link.code}</h1>
            <p className="lede">
              {peerState === "fail"
                ? "No se pudo conectar. Sal y crea otra mesa."
                : theirFlag
                  ? "Elige tu lado. Si los dos quieren el mismo, el sorteo lo decide."
                  : "Pásale el código. Cada quien elige su chapa, y después el lado."}
            </p>
          </header>
          <div className="home-actions">
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
              Copiar código
            </button>
          </div>
          {note ? <p className="lede">{note}</p> : null}
          <Picker label="Tu chapa" hint={myClaim === "gold" ? "Quieres oro" : myClaim === "silver" ? "Quieres plata" : "La bandera es el dibujo"} metal={skirt} value={mine} onChange={pickMine} />
          <div className="their-seat">
            {theirFlag ? (
              <>
                <Cap country={theirFlag} metal={theirClaim ?? "steel"} king={false} />
                <div>
                  <strong>{countryName(theirFlag)}</strong>
                  <span>
                    {theirClaim === "gold" ? "Quiere oro" : theirClaim === "silver" ? "Quiere plata" : "Ya está. Falta el lado."}
                  </span>
                </div>
              </>
            ) : (
              <p>{peerState === "ok" ? "Conectado. Esperando su chapa…" : "Esperando a la otra persona…"}</p>
            )}
          </div>
          <div className="seat-choice">
            <button type="button" className={`gold ${myClaim === "gold" ? "on" : ""}`} data-seat="gold" disabled={!readySeat} onClick={() => claimSide("gold")}>
              <strong>Oro</strong>
              <small>Sales tú</small>
            </button>
            <button type="button" className={`silver ${myClaim === "silver" ? "on" : ""}`} data-seat="silver" disabled={!readySeat} onClick={() => claimSide("silver")}>
              <strong>Plata</strong>
              <small>Sale la otra</small>
            </button>
          </div>
          {clash ? <p className="join-error">Los dos quieren {myClaim === "gold" ? "oro" : "plata"}. Cambia de lado, o haz el sorteo.</p> : null}
          {myClaim && theirClaim && myClaim !== theirClaim ? <p className="lede">Cerrando la mesa…</p> : null}
          <div className="home-actions">
            <button type="button" className="btn primary" onClick={sorteo} disabled={!readySeat}>
              Sorteo
            </button>
            <button type="button" className="btn ghost" onClick={quit}>
              Salir
            </button>
          </div>
        </div>
      </main>
    );
  }

  const goldName = countryName(you);
  const silverName = countryName(them);
  const flipped =
    (mode === "online" && onlineSide === "silver") ||
    (mode === "hotseat" && status.turn === "silver" && !status.winner);
  const selectedMoves = selected ? moves.filter((move) => same(move.from, selected)) : [];
  const mustCapture = moves.some((move) => move.captures.length > 0);

  let turnText = status.turn === "gold" ? goldName : silverName;
  if (status.winner === "draw") turnText = "Tablas";
  else if (status.winner === "gold" || status.winner === "silver") {
    if (mode === "ai") turnText = status.winner === "gold" ? "Ganaste" : "Perdiste";
    else if (mode === "online") turnText = status.winner === onlineSide ? "Ganaste" : "Perdiste";
    else turnText = `Ganó ${status.winner === "gold" ? goldName : silverName}`;
  }
  else if (thinking) turnText = "La máquina piensa";
  else if (mode === "ai" && status.turn === "gold") turnText = "Te toca";
  else if (mode === "hotseat") turnText = status.turn === "gold" ? `Oro · ${goldName}` : `Plata · ${silverName}`;
  else if (mode === "online" && peerState === "fail") turnText = "Sin conexión";
  else if (mode === "online" && peerState === "wait") turnText = "Esperando";
  else if (mode === "online" && status.turn === mySide) turnText = "Te toca";
  else if (mode === "online") turnText = "Le toca";

  const playView = (
    <main className="wood-app play" data-side={onlineSide ?? ""} data-gold={you} data-silver={them}>
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

  return (
    <>
      {seatView}
      {screen === "play" ? playView : null}
      {link && (screen === "seat" || screen === "play") ? (
        <RoomBridge
          key={`${link.role}-${link.code}`}
          code={link.code}
          role={link.role}
          sendRef={sendRef}
          onPeers={setPeers}
          onNetRef={onNetRef}
        />
      ) : null}
    </>
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
  metal: Skirt;
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
    <div className={`score ${metal} ${active ? "on" : ""}`} aria-label={`${label} ${countryName(country)}`}>
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
