import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSONS,
  createCpuState,
  decodeInstruction,
  encodeInstruction,
  parseProgram,
  restoreSnapshot,
  stepCpu,
} from "../lib/cpu.ts";

const runToStop = (state: ReturnType<typeof createCpuState>, limit = 500) => {
  let next = state;
  for (let index = 0; index < limit && next.status === "ready"; index += 1) {
    next = stepCpu(next);
  }
  return next;
};

test("supported instructions encode and decode as 16-bit words", () => {
  const lines = [
    "LOAD R1, 0x80",
    "LOADI R2, 255",
    "ADD R3, R1, R2",
    "SUB R0, R3, R1",
    "STORE 0x84, R3",
    "CMP R1, 5",
    "JMP 0x20",
    "JE 0x24",
    "JNE 0x28",
    "HALT",
  ];
  const parsed = parseProgram(lines);
  assert.equal(parsed.diagnostics[0], undefined);
  for (const instruction of parsed.instructions) {
    const bits = encodeInstruction(instruction);
    assert.match(bits, /^[01]{16}$/);
    const decoded = decodeInstruction(bits, instruction.address, instruction.lineIndex);
    assert.equal(decoded.valid, true);
    assert.equal(decoded.op, instruction.op);
    assert.deepEqual(decoded.args, instruction.args);
  }
});

test("labels resolve to aligned instruction addresses", () => {
  const parsed = parseProgram(["LOADI R1, 0", "loop:", "CMP R1, 5", "JNE loop", "HALT"]);
  assert.equal(parsed.labels.loop, 4);
  assert.equal(parsed.instructions[2].args[0], 4);
});

test("undefined and malformed machine words remain executable faults", () => {
  const undefinedWord = decodeInstruction("1111111111111111");
  assert.equal(undefinedWord.valid, false);
  assert.match(undefinedWord.error ?? "", /定義されていません/);
  const malformed = decodeInstruction("1010");
  assert.equal(malformed.valid, false);
  assert.match(malformed.error ?? "", /16個/);
});

test("default lesson stores 5 + 3 in memory and halts", () => {
  const final = runToStop(createCpuState(LESSONS[0]));
  assert.equal(final.status, "halted");
  assert.equal(final.registers[3], 8);
  assert.equal(final.memory[0x80], 8);
  assert.ok(final.cycle > 20);
});

test("memory lesson loads, adds and stores", () => {
  const lesson = LESSONS.find((item) => item.id === "memory")!;
  const final = runToStop(createCpuState(lesson));
  assert.equal(final.registers[1], 5);
  assert.equal(final.registers[2], 3);
  assert.equal(final.memory[0x88], 8);
});

test("if lesson takes and skips JNE based on Equal flag", () => {
  const lesson = LESSONS.find((item) => item.id === "if")!;
  const success = runToStop(createCpuState(lesson));
  assert.equal(success.registers[2], 1);

  const failureStart = createCpuState(lesson);
  failureStart.registers[1] = 3;
  const failure = runToStop(failureStart);
  assert.equal(failure.registers[2], 0);
});

test("loop lesson jumps backward until R1 reaches five", () => {
  const lesson = LESSONS.find((item) => item.id === "loop")!;
  const final = runToStop(createCpuState(lesson));
  assert.equal(final.status, "halted");
  assert.equal(final.registers[1], 5);
});

test("8-bit subtraction wraps and undo restores an exact prior state", () => {
  const lesson = { ...LESSONS[0], program: ["LOADI R1, 0", "LOADI R2, 1", "SUB R3, R1, R2", "HALT"] };
  let state = createCpuState(lesson);
  while (state.status === "ready" && !(state.ir?.op === "SUB" && state.phase === "advance")) state = stepCpu(state);
  assert.equal(state.registers[3], 255);
  const previousCycle = state.cycle - 1;
  const restored = restoreSnapshot(state);
  assert.equal(restored.cycle, previousCycle);
  assert.equal(restored.phase, "writeback");
  assert.equal(restored.registers[3], 0);
});

test("missing PC target and invalid instruction stop with a fault", () => {
  const missing = createCpuState(LESSONS[0]);
  missing.pc = 0xfc;
  assert.equal(stepCpu(missing).status, "fault");

  const badLesson = { ...LESSONS[0], program: ["1111111111111111"] };
  const bad = runToStop(createCpuState(badLesson));
  assert.equal(bad.status, "fault");
});
