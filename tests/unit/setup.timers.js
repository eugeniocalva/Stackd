import { afterAll } from 'vitest';

// 1.3.2: the src files run as plain globals inside each test file's jsdom, and
// some of them start timers (sheet animations, announcers, debounces). A timer
// still pending when a file ends used to fire after vitest tore that file's
// jsdom down — "ReferenceError: document is not defined" as an unhandled
// error, which fails the run although every test passed (CI runs 43488035725,
// 45127137310, 45286600218, each in a different file). Track every timer the
// file starts and cancel the ones still pending when the file ends.
const pending = new Map(); // handle → clear function

const wrap = (setName, clearName, once) => {
  const set = globalThis[setName];
  const clear = globalThis[clearName];
  if (typeof set !== 'function' || typeof clear !== 'function') return;
  globalThis[setName] = function (fn, ...rest) {
    let handle;
    const run = once && typeof fn === 'function'
      ? function (...args) { pending.delete(handle); return fn.apply(this, args); }
      : fn;
    handle = set.call(this, run, ...rest);
    pending.set(handle, clear);
    return handle;
  };
  globalThis[clearName] = function (handle) {
    pending.delete(handle);
    return clear.call(this, handle);
  };
};

wrap('setTimeout', 'clearTimeout', true);
wrap('setInterval', 'clearInterval', false);

afterAll(() => {
  for (const [handle, clear] of pending) clear(handle);
  pending.clear();
});
