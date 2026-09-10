const ENCODINGS = ["latin1", "utf-16", "utf-16be", "utf-8"];

function synchsafe(view, offset) {
  return (view.getUint8(offset) << 21)
    | (view.getUint8(offset + 1) << 14)
    | (view.getUint8(offset + 2) << 7)
    | view.getUint8(offset + 3);
}

function decode(bytes, encodingByte) {
  const label = ENCODINGS[encodingByte] || "utf-8";
  try {
    return new TextDecoder(label).decode(bytes).replace(/\0+$/, "").trim();
  } catch {
    return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "").trim();
  }
}

function readFrames(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};

  const major = view.getUint8(3);
  const tagSize = synchsafe(view, 6);
  const short = major === 2;
  const idLength = short ? 3 : 4;
  const headerLength = short ? 6 : 10;

  const wanted = short
    ? { TT2: "title", TP1: "artist", TAL: "album" }
    : { TIT2: "title", TPE1: "artist", TALB: "album" };

  const found = {};
  let offset = 10;
  const end = Math.min(buffer.byteLength, tagSize + 10);

  while (offset + headerLength <= end) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + idLength));
    if (!/^[A-Z0-9]+$/.test(id)) break;

    const size = short
      ? (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5)
      : (major === 4 ? synchsafe(view, offset + 4) : view.getUint32(offset + 4));

    if (size <= 0 || offset + headerLength + size > end) break;

    const key = wanted[id];
    if (key) {
      const data = bytes.slice(offset + headerLength, offset + headerLength + size);
      found[key] = decode(data.slice(1), data[0]);
    }

    offset += headerLength + size;
    if (Object.keys(found).length === Object.keys(wanted).length) break;
  }

  return found;
}

export function titleFromFilename(name) {
  const stem = (name || "").replace(/\.[a-z0-9]+$/i, "");
  const spaced = /\s-\s/.test(stem);

  return (spaced ? stem.replace(/\s+-\s+/g, " — ") : stem.replace(/-+/g, " "))
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function readTrackName(file) {
  const fallback = titleFromFilename(file?.name);

  try {
    const head = await file.slice(0, 262144).arrayBuffer();
    const { title, artist } = readFrames(head);

    if (title && artist) return `${title} — ${artist}`;
    if (title) return title;
  } catch (err) {
    console.warn("Could not read the tag; using the filename.", err);
  }

  return fallback;
}
