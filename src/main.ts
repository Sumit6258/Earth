export {};
const el = document.querySelector<HTMLElement>('#build');
if (el) el.textContent = `build ${__BUILD_SHA__} · ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC`;
