/**
 * Bytes out of a data URL, without going near the network layer.
 *
 * `fetch(dataUrl)` is the obvious way to do this and it does not work here. The
 * app ships
 *
 *   connect-src ipc: http://ipc.localhost
 *
 * and `data:` is not on that list, so the packaged app refuses the request. It
 * refuses it as a rejected promise, which is why three separate features --
 * a signature's background colour, placing a saved signature in the editor, and
 * placing a newly drawn one -- all did nothing at all and said nothing about it.
 *
 * Decoding the base64 is what was wanted in the first place: no request, no
 * policy to satisfy, and it cannot fail for reasons outside this function.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('not a base64 data URL');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
