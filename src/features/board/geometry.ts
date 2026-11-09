import type { BoardNode, DeviceNode, RegisterNode, UnitNode } from "./types.ts";

export const BOARD = { W: 640, H: 520, IBUS: 168, ABUS: 330, DBUS: 352, DPORT: 320, DEV_Y: 380, SIGMA_X: 84 } as const;
export type Point = readonly [number, number];
export interface Box { x: number; y: number; w: number; h: number }
export type NodeKind = "register" | "unit" | "flags" | "device" | "monitor" | "later";

const REG_W = 64;
const REG_H = 44;
export const REGISTER_POSITIONS: Readonly<Record<RegisterNode, Point>> = {
  CS: [24, 44], DS: [96, 44], SS: [168, 44], ES: [240, 44], IP: [24, 100],
  AX: [336, 44], BX: [408, 44], CX: [480, 44], DX: [552, 44],
  SP: [336, 100], BP: [408, 100], SI: [480, 100], DI: [552, 100]
};
export const UNIT_BOXES: Readonly<Record<UnitNode, Box & { kind: NodeKind }>> = {
  SIGMA: { x: 24, y: 248, w: 120, h: 44, kind: "unit" },
  QUEUE: { x: 148, y: 188, w: 156, h: 44, kind: "unit" },
  CU: { x: 336, y: 188, w: 112, h: 44, kind: "unit" },
  ALU: { x: 464, y: 188, w: 152, h: 44, kind: "unit" },
  FLAGS: { x: 336, y: 248, w: 280, h: 44, kind: "flags" },
  MEM: { x: 16, y: 380, w: 196, h: 132, kind: "device" },
  SCREEN: { x: 224, y: 380, w: 200, h: 132, kind: "monitor" },
  KBD: { x: 436, y: 380, w: 76, h: 132, kind: "device" },
  IO: { x: 524, y: 380, w: 100, h: 40, kind: "device" },
  T8253: { x: 524, y: 426, w: 100, h: 40, kind: "later" },
  P8259: { x: 524, y: 472, w: 100, h: 40, kind: "later" }
};
export const DEVICE_TAPS: Readonly<Record<DeviceNode, { addr?: number; data: number }>> = {
  MEM: { addr: 84, data: 150 }, SCREEN: { addr: 300, data: 392 }, KBD: { data: 474 }, IO: { data: 574 }
};
const FLAGS_ANCHOR: Point = [456, 248];
const LOCAL_X: Readonly<Partial<Record<string, number>>> = { "ALU>FLAGS": 540, "FLAGS>ALU": 540, "FLAGS>CU": 392, "CU>FLAGS": 392 };

const isRegister = (n: BoardNode): n is RegisterNode => n in REGISTER_POSITIONS;
export const isUnitNode = (n: BoardNode): n is UnitNode => n in UNIT_BOXES;
const isDevice = (n: BoardNode): n is DeviceNode => n in DEVICE_TAPS;

export const boxOf = (n: BoardNode): Box => {
  if (isRegister(n)) { const [x, y] = REGISTER_POSITIONS[n]; return { x, y, w: REG_W, h: REG_H }; }
  return UNIT_BOXES[n];
};

const anchor = (n: BoardNode): Point => {
  if (n === "FLAGS") return FLAGS_ANCHOR;
  const b = boxOf(n);
  return b.y + b.h <= BOARD.IBUS ? [b.x + b.w / 2, b.y + b.h] : [b.x + b.w / 2, b.y];
};

export const route = (a: BoardNode, b: BoardNode): Point[] => {
  const B = BOARD;
  if (a === "SIGMA" && isDevice(b)) {
    const x = DEVICE_TAPS[b].addr ?? DEVICE_TAPS[b].data;
    return [[B.SIGMA_X, 292], [B.SIGMA_X, B.ABUS], [x, B.ABUS], [x, B.DEV_Y]];
  }
  if (isDevice(a) && isDevice(b)) {
    const da = DEVICE_TAPS[a].data, db = DEVICE_TAPS[b].data;
    return [[da, B.DEV_Y], [da, B.DBUS], [db, B.DBUS], [db, B.DEV_Y]];
  }
  if (isDevice(a)) {
    const p = anchor(b), d = DEVICE_TAPS[a].data;
    return [[d, B.DEV_Y], [d, B.DBUS], [B.DPORT, B.DBUS], [B.DPORT, B.IBUS], [p[0], B.IBUS], p];
  }
  if (isDevice(b)) {
    const p = anchor(a), d = DEVICE_TAPS[b].data;
    return [p, [p[0], B.IBUS], [B.DPORT, B.IBUS], [B.DPORT, B.DBUS], [d, B.DBUS], [d, B.DEV_Y]];
  }
  const lx = LOCAL_X[`${a}>${b}`];
  if (lx !== undefined) {
    const A = boxOf(a), C = boxOf(b), down = A.y < C.y;
    return [[lx, down ? A.y + A.h : A.y], [lx, down ? C.y : C.y + C.h]];
  }
  const pa = anchor(a), pb = anchor(b);
  return [pa, [pa[0], B.IBUS], [pb[0], B.IBUS], pb];
};

export const pathD = (pts: readonly Point[]): string =>
  `M${pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]).map(p => p.join(" ")).join(" L")}`;

export const REGISTER_NODES: readonly RegisterNode[] = ["CS", "DS", "SS", "ES", "IP", "AX", "BX", "CX", "DX", "SP", "BP", "SI", "DI"];
export const UNIT_NODES: readonly UnitNode[] = ["SIGMA", "QUEUE", "CU", "ALU", "FLAGS", "MEM", "SCREEN", "KBD", "IO", "T8253", "P8259"];
const INTERNAL_NODES: readonly BoardNode[] = [...REGISTER_NODES, "SIGMA", "QUEUE", "CU", "ALU", "FLAGS"];

export const STATIC_WIRES = {
  internalBus: `M24 ${BOARD.IBUS} H616`,
  internal: [
    ...INTERNAL_NODES.map(id => { const p = anchor(id); return `M${p[0]} ${p[1]} V${BOARD.IBUS}`; }),
    "M540 232 V248", "M392 248 V232", `M${BOARD.DPORT} ${BOARD.IBUS} V300`
  ],
  buses: [`M16 ${BOARD.ABUS} H624`, `M16 ${BOARD.DBUS} H624`],
  copper: [
    `M${BOARD.DPORT} 300 V${BOARD.DBUS}`, `M${BOARD.SIGMA_X} 292 V${BOARD.DEV_Y}`,
    ...Object.values(DEVICE_TAPS).flatMap(d => [
      ...(d.addr !== undefined && d.addr !== BOARD.SIGMA_X ? [`M${d.addr} ${BOARD.ABUS} V${BOARD.DEV_Y}`] : []),
      `M${d.data} ${BOARD.DBUS} V${BOARD.DEV_Y}`
    ])
  ],
  later: ["M574 420 V426", "M574 466 V472"]
} as const;
