// Activation and second-instance events may arrive while asynchronous startup is pending.
export function createReadyOpener(start, open) {
  let ready, pending;
  return function requestOpen() {
    if (pending) return pending;
    ready ??= Promise.resolve().then(start);
    pending = ready.then(open).finally(() => { pending = undefined; });
    return pending;
  };
}
