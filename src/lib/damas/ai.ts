import { applyMove, legalMoves, other, type Board, type Move, type Side } from "./rules";

const MAN = 100;
const KING = 340;

function score(board: Board, side: Side): number {
  let total = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      let value = piece.kind === "king" ? KING : MAN;
      if (piece.kind === "man") {
        const forward = piece.side === "gold" ? 9 - r : r;
        value += forward * 4;
        if (c > 1 && c < 8 && r > 1 && r < 8) value += 3;
      } else if (r > 0 && r < 9 && c > 0 && c < 9) {
        value += 6;
      }
      total += piece.side === side ? value : -value;
    }
  }
  return total;
}

function search(board: Board, side: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, side);
  if (moves.length === 0) return -8000 + (4 - depth);
  if (depth === 0) return score(board, side);
  moves.sort((a, b) => b.captures.length - a.captures.length);
  let best = -Infinity;
  for (const move of moves) {
    const next = applyMove(board, move);
    const value = -search(next, other(side), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseMove(board: Board, side: Side): Move | null {
  const moves = legalMoves(board, side);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  const depth = moves.some((move) => move.captures.length > 0) ? 3 : 2;
  let best = -Infinity;
  const tied: Move[] = [];
  for (const move of moves) {
    const value = -search(applyMove(board, move), other(side), depth - 1, -Infinity, Infinity);
    if (value > best + 8) {
      best = value;
      tied.length = 0;
      tied.push(move);
    } else if (value >= best - 8) {
      if (value > best) best = value;
      tied.push(move);
    }
  }
  return tied[Math.floor(Math.random() * tied.length)] ?? moves[0];
}
