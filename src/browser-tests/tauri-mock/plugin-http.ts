/** @tauri-apps/plugin-http — the network, which a local-first app must not need. */
import { unregistered } from './state';

export async function fetch(input: string): Promise<Response> {
  // PaperOtter's promise is that documents never leave the machine. A test that
  // reaches the network is either testing the update check or has found a leak,
  // and both deserve to stop here rather than quietly succeed.
  unregistered('http.fetch', `url ${JSON.stringify(String(input))}`);
}
