/**
 * Reads the title and artist out of an audio file, in the browser, before it
 * is uploaded.
 *
 * The track name used to be derived from the delivery URL — and Cloudinary
 * names an upload with a random public id, so what came back was gibberish or
 * nothing at all. The name of a piece of music is in the file: an ID3 tag if
 * the person who made it filled one in, and the filename if not.
 *
 * Only the first part of the file is read. An ID3v2 tag sits at the very
 * front and declares its own length, so there is never a reason to pull a
 * whole track across just to learn what it is called.
 */

const ENCODINGS = ["latin1", "utf-16", "utf-16be", "utf-8"];

/** ID3v2 sizes are "synchsafe": seven bits per byte, top bit always clear. */
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

/**
 * Pulls the text frames we care about. Handles v2.2's three-character frame
 * ids as well as the four-character ones used since v2.3, because plenty of
 * older files in people's music folders are still v2.2.
 */
function readFrames(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};  // "ID3"

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
    if (!/^[A-Z0-9]+$/.test(id)) break;   // padding, or the end of the tag

    const size = short
      ? (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5)
      // v2.4 made frame sizes synchsafe; v2.3 left them plain. A plain size
      // with a byte over 0x7f cannot be synchsafe, which is how they are told
      // apart without trusting the version alone.
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

/**
 * A readable name from a filename, for files with no tag at all.
 *
 * A hyphen with spaces around it is the "Artist - Title" convention and
 * becomes a dash; a hyphen without them is just how the file was named and
 * becomes a space. Treating both the same turned "morning-study.mp3" into
 * "morning — study", which is not what anyone called it.
 */
export function titleFromFilename(name) {
  const stem = (name || "").replace(/\.[a-z0-9]+$/i, "");
  const spaced = /\s-\s/.test(stem);

  return (spaced ? stem.replace(/\s+-\s+/g, " — ") : stem.replace(/-+/g, " "))
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * The name to show for a track: its tagged title, credited to its artist where
 * there is one, and its filename when the file carries no tag.
 */
export async function readTrackName(file) {
  const fallback = titleFromFilename(file?.name);

  try {
    // 256 KB is far more than any sane tag, and covers embedded cover art
    // sitting in front of the text frames.
    const head = await file.slice(0, 262144).arrayBuffer();
    const { title, artist } = readFrames(head);

    if (title && artist) return `${title} — ${artist}`;
    if (title) return title;
  } catch (err) {
    console.warn("Could not read the tag; using the filename.", err);
  }

  return fallback;
}
