// The publisher's main.js registers its original 25 ms game callback here.
// This wrapper gates that callback; it does not replace game mechanics.
window.researchClock = {frame:0, pending:0, callback:null, resolve:null,
  caption:'Recording check before the first attempt.', active:false, lastError:null};
window.realSetInterval = window.setInterval.bind(window);
const NativeDate = window.Date;
const researchEpoch = NativeDate.now();
window.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [researchEpoch + researchClock.frame * 25])); }
  static now() { return researchEpoch + researchClock.frame * 25; }
};
window.setInterval = function(callback, delay, ...args) {
  if (Math.abs(delay - 25) < .001 && !researchClock.callback) {
    researchClock.callback = callback;
    return -40000;
  }
  return realSetInterval(callback, delay, ...args);
};
window.cmgAdBreakCall = function() {};
