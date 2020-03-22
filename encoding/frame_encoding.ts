import {
  encodeOctet,
  encodeShortUint,
  encodeLongUint,
  decodeOctet,
  decodeShortUint,
  decodeLongUint
} from "./number_encoding.ts";
import {
  FRAME_BODY,
  FRAME_HEADER,
  FRAME_HEARTBEAT,
  FRAME_METHOD,
  FRAME_END
} from "../amqp_constants.ts";

export interface Frame {
  type: number;
  channel: number;
  payload: Uint8Array;
}

const frameTypes = [FRAME_BODY, FRAME_HEADER, FRAME_HEARTBEAT, FRAME_METHOD];

function assertType(type: number) {
  if (!frameTypes.includes(type)) {
    throw new Error(`Invalid frame type '${type}'`);
  }
}

async function readBytes(
  r: Deno.Reader,
  length: number
): Promise<Uint8Array | null> {
  const data = new Uint8Array(length);
  const n = await r.read(data);

  if (n === 0) {
    return readBytes(r, length);
  }

  if (n !== length) {
    return null;
  }

  return data;
}

export function encodeFrame(frame: Frame) {
  const buffer = new Deno.Buffer();
  buffer.writeSync(encodeOctet(frame.type));
  buffer.writeSync(encodeShortUint(frame.channel));
  buffer.writeSync(encodeLongUint(frame.payload.length));
  buffer.writeSync(frame.payload);
  buffer.writeSync(encodeOctet(FRAME_END));
  return buffer.bytes();
}

export async function readFrame(r: Deno.Reader): Promise<Frame | null> {
  const prefix = await readBytes(r, 7);
  if (!prefix) {
    return null;
  }

  const prefixReader = new Deno.Buffer(prefix);
  const type = decodeOctet(prefixReader);
  const channel = decodeShortUint(prefixReader);
  const length = decodeLongUint(prefixReader);

  const rest = await readBytes(r, length + 1);
  if (!rest) {
    throw new Error(`Not enough data in reader`);
  }

  if (rest[rest.length - 1] !== FRAME_END) {
    throw new Error(`Unexpected end token ${rest[rest.length - 1]}`);
  }

  assertType(type);

  return {
    type: type,
    channel: channel,
    payload: rest.slice(0, rest.length - 1)
  };
}