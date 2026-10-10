export type Side = "gold" | "silver";
export type Kind = "man" | "king";
export type Piece = { side: Side; kind: Kind };
export type Board = (Piece | null)[][];
export type Pos = { r: number; c: number };

export type Move = {
  from: Pos;
  to: Pos;
  captures: Pos[];
  path: Pos[];
  promote: boolean;
};

export type Status = {
  board: Board;
  turn: Side;
  winner: Side | "draw" | null;
  quiet: number;
  seen: string[];
};

export const N = 10;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function other(side: Side): Side {
  return side === "gold" ? "silver" : "gold";
}

export function isDark(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < N && c < N;
}

export function promoRow(side: Side): number {
  return side === "gold" ? 0 : N - 1;
}

function key(p: Pos): number {
  return p.r * N + p.c;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function initialBoard(): Board {
  const board: Board = Array.from({ length: N }, () => Array<Piece | null>(N).fill(null));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!isDark(r, c)) continue;
      if (r <= 3) board[r][c] = { side: "silver", kind: "man" };
      else if (r >= 6) board[r][c] = { side: "gold", kind: "man" };
    }
  }
  return board;
}

function open(board: Board, r: number, c: number, captured: Set<number>, origin: Pos): boolean {
  if (!inBounds(r, c)) return false;
  if (r === origin.r && c === origin.c) return true;
  const piece = board[r][c];
  if (!piece) return true;
  return captured.has(key({ r, c }));
}

function live(board: Board, r: number, c: number, captured: Set<number>, origin: Pos): Piece | null {
  if (!inBounds(r, c)) return null;
  if (r === origin.r && c === origin.c) return null;
  const piece = board[r][c];
  if (!piece || captured.has(key({ r, c }))) return null;
  return piece;
}

type Jump = { land: Pos; victim: Pos };

function manJumps(board: Board, side: Side, pos: Pos, captured: Set<number>, origin: Pos): Jump[] {
  const jumps: Jump[] = [];
  for (const [dr, dc] of DIRS) {
    const vr = pos.r + dr;
    const vc = pos.c + dc;
    const lr = pos.r + 2 * dr;
    const lc = pos.c + 2 * dc;
    const victim = live(board, vr, vc, captured, origin);
    if (!victim || victim.side === side) continue;
    if (!open(board, lr, lc, captured, origin)) continue;
    jumps.push({ land: { r: lr, c: lc }, victim: { r: vr, c: vc } });
  }
  return jumps;
}

function kingJumps(board: Board, side: Side, pos: Pos, captured: Set<number>, origin: Pos): Jump[] {
  const jumps: Jump[] = [];
  for (const [dr, dc] of DIRS) {
    let r = pos.r + dr;
    let c = pos.c + dc;
    while (open(board, r, c, captured, origin) && !live(board, r, c, captured, origin)) {
      r += dr;
      c += dc;
    }
    const victim = live(board, r, c, captured, origin);
    if (!victim || victim.side === side) continue;
    let lr = r + dr;
    let lc = c + dc;
    while (open(board, lr, lc, captured, origin)) {
      jumps.push({ land: { r: lr, c: lc }, victim: { r, c } });
      const ahead = live(board, lr + dr, lc + dc, captured, origin);
      if (ahead) break;
      lr += dr;
      lc += dc;
    }
  }
  return jumps;
}

function captureSequences(board: Board, side: Side, from: Pos): Move[] {
  const piece = board[from.r][from.c];
  if (!piece || piece.side !== side) return [];
  const found: Move[] = [];
  const jumps = piece.kind === "king" ? kingJumps : manJumps;

  const walk = (pos: Pos, captured: Set<number>, path: Pos[], caps: Pos[]) => {
    const next = jumps(board, side, pos, captured, path[0]);
    if (next.length === 0) {
      if (caps.length === 0) return;
      const to = path[path.length - 1];
      found.push({
        from,
        to,
        captures: caps,
        path,
        promote: piece.kind === "man" && to.r === promoRow(side),
      });
      return;
    }
    for (const jump of next) {
      const set = new Set(captured);
      set.add(key(jump.victim));
      walk(jump.land, set, [...path, jump.land], [...caps, jump.victim]);
    }
  };

  walk(from, new Set(), [from], []);
  return found;
}

function quietMoves(board: Board, side: Side): Move[] {
  const moves: Move[] = [];
  const dirs = side === "gold" ? [DIRS[0], DIRS[1]] : [DIRS[2], DIRS[3]];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const piece = board[r][c];
      if (!piece || piece.side !== side) continue;
      if (piece.kind === "man") {
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc) || board[nr][nc]) continue;
          const to = { r: nr, c: nc };
          moves.push({
            from: { r, c },
            to,
            captures: [],
            path: [{ r, c }, to],
            promote: nr === promoRow(side),
          });
        }
      } else {
        for (const [dr, dc] of DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          while (inBounds(nr, nc) && !board[nr][nc]) {
            const to = { r: nr, c: nc };
            moves.push({
              from: { r, c },
              to,
              captures: [],
              path: [{ r, c }, to],
              promote: false,
            });
            nr += dr;
            nc += dc;
          }
        }
      }
    }
  }
  return moves;
}

function dedupe(moves: Move[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const move of moves) {
    const caps = move.captures.map(key).sort((a, b) => a - b);
    const id = `${move.to.r},${move.to.c}|${caps.join(".")}|${move.promote ? 1 : 0}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(move);
  }
  return out;
}

export function legalMoves(board: Board, side: Side): Move[] {
  const captures: Move[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const piece = board[r][c];
      if (!piece || piece.side !== side) continue;
      captures.push(...captureSequences(board, side, { r, c }));
    }
  }
  if (captures.length === 0) return quietMoves(board, side);
  const max = Math.max(...captures.map((move) => move.captures.length));
  return dedupe(captures.filter((move) => move.captures.length === max));
}

export function applyMove(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const piece = next[move.from.r][move.from.c];
  if (!piece) return next;
  next[move.from.r][move.from.c] = null;
  for (const cap of move.captures) next[cap.r][cap.c] = null;
  next[move.to.r][move.to.c] = {
    side: piece.side,
    kind: move.promote ? "king" : piece.kind,
  };
  return next;
}

export function boardKey(board: Board, turn: Side): string {
  let key = turn === "gold" ? "g" : "s";
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const piece = board[r][c];
      if (!piece) key += ".";
      else key += (piece.side === "gold" ? "G" : "S") + (piece.kind === "king" ? "K" : "M");
    }
  }
  return key;
}

export function createStatus(): Status {
  const board = initialBoard();
  const turn: Side = "gold";
  return { board, turn, winner: null, quiet: 0, seen: [boardKey(board, turn)] };
}

export function emptyBoard(): Board {
  return Array.from({ length: N }, () => Array<Piece | null>(N).fill(null));
}

export function step(state: Status, move: Move): Status {
  const board = applyMove(state.board, move);
  const quiet = move.captures.length > 0 ? 0 : state.quiet + 1;
  const turn = other(state.turn);
  const position = boardKey(board, turn);
  const seen = [...state.seen, position];
  const repeats = seen.filter((item) => item === position).length;
  let winner: Status["winner"] = null;
  if (legalMoves(board, turn).length === 0) winner = state.turn;
  else if (quiet >= 60 || repeats >= 3) winner = "draw";
  return { board, turn, winner, quiet, seen };
}

export function countPieces(board: Board, side: Side): number {
  let n = 0;
  for (const row of board) for (const piece of row) if (piece?.side === side) n++;
  return n;
}

export function countKings(board: Board, side: Side): number {
  let n = 0;
  for (const row of board) {
    for (const piece of row) if (piece?.side === side && piece.kind === "king") n++;
  }
  return n;
}
