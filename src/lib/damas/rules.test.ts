import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  emptyBoard,
  initialBoard,
  legalMoves,
  type Board,
  type Piece,
} from "./rules.ts";

function place(board: Board, r: number, c: number, piece: Piece) {
  board[r][c] = piece;
}

test("gold opens with the nine forward steps", () => {
  const moves = legalMoves(initialBoard(), "gold");
  assert.equal(moves.length, 9);
  assert.ok(moves.every((move) => move.captures.length === 0 && move.to.r < move.from.r));
});

test("a man does not walk backward", () => {
  const board = emptyBoard();
  place(board, 4, 3, { side: "gold", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.ok(moves.every((move) => move.to.r === 3));
  assert.equal(moves.length, 2);
});

test("a man eats backward", () => {
  const board = emptyBoard();
  place(board, 4, 3, { side: "gold", kind: "man" });
  place(board, 5, 4, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].to, { r: 6, c: 5 });
  assert.equal(moves[0].captures.length, 1);
});

test("majority capture is mandatory", () => {
  const board = emptyBoard();
  place(board, 6, 1, { side: "gold", kind: "man" });
  place(board, 5, 2, { side: "silver", kind: "man" });
  place(board, 6, 7, { side: "gold", kind: "man" });
  place(board, 5, 6, { side: "silver", kind: "man" });
  place(board, 3, 6, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.ok(moves.every((move) => move.captures.length === 2));
  assert.ok(moves.every((move) => move.from.r === 6 && move.from.c === 7));
});

test("a man that stops on the last rank becomes a dama", () => {
  const board = emptyBoard();
  place(board, 1, 4, { side: "gold", kind: "man" });
  const [move] = legalMoves(board, "gold");
  assert.equal(move.promote, true);
  const next = applyMove(board, move);
  assert.equal(next[0][move.to.c]?.kind, "king");
});

test("a man keeps eating through the last rank and only crowns if it stops there", () => {
  const board = emptyBoard();
  place(board, 2, 4, { side: "gold", kind: "man" });
  place(board, 1, 3, { side: "silver", kind: "man" });
  place(board, 1, 1, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.equal(moves.length, 1);
  assert.equal(moves[0].promote, false);
  assert.deepEqual(moves[0].to, { r: 2, c: 0 });
  assert.equal(moves[0].captures.length, 2);
  const next = applyMove(board, moves[0]);
  assert.equal(next[2][0]?.kind, "man");
});

test("crowning ends the turn even if a dama could keep eating", () => {
  const board = emptyBoard();
  place(board, 2, 2, { side: "gold", kind: "man" });
  place(board, 1, 1, { side: "silver", kind: "man" });
  place(board, 3, 3, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.ok(moves.every((move) => move.captures.length === 1));
  assert.ok(moves.some((move) => move.promote && move.to.r === 0));
});

test("a dama flies and chooses where to stop after a capture", () => {
  const board = emptyBoard();
  place(board, 7, 1, { side: "gold", kind: "king" });
  place(board, 4, 4, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  const lands = moves.map((move) => `${move.to.r},${move.to.c}`).sort();
  assert.deepEqual(lands, ["0,8", "1,7", "2,6", "3,5"]);
});

test("a captured cap does not block the rest of the capture and cannot be eaten twice", () => {
  const board = emptyBoard();
  place(board, 2, 2, { side: "gold", kind: "king" });
  place(board, 4, 4, { side: "silver", kind: "man" });
  place(board, 1, 1, { side: "silver", kind: "man" });
  const moves = legalMoves(board, "gold");
  assert.ok(moves.some((move) => move.captures.length === 2));
  assert.ok(moves.every((move) => move.captures.length === 2));
  for (const move of moves) {
    const ids = move.captures.map((pos) => pos.r * 10 + pos.c);
    assert.equal(new Set(ids).size, ids.length);
  }
});
