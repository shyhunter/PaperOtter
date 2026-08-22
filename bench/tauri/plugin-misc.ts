export async function check() { return null; }
export async function relaunch() {}
export async function exit(_c?: number) {}
export async function openUrl(_u: string) {}
export async function openPath(_p: string) {}
export const Command = { create: () => ({ execute: async () => ({ code: 0, stdout: '', stderr: '' }) }) };
export const fetch = window.fetch.bind(window);
