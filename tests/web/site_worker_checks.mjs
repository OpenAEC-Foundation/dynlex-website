const require = (condition, message) => { if (!condition) throw new Error(message); };

export async function verifyWorkers(base = new URL('/', location.href)) {
  const [{ createCompilerServices }, { WorkerConnection }] = await Promise.all([
    import(new URL('compiler/services.js', base)), import(new URL('compiler/client.js', base))
  ]);
  const provider = createCompilerServices(new URL('compiler/', base), new URL('sdk-sources.json', base));
  const deadline = new AbortController();
  const signal = deadline.signal;
  let timer;
  const enterPhase = phase => {
    clearTimeout(timer);
    timer = setTimeout(() => deadline.abort(new Error(`Worker test timed out during ${phase}`)), 30000);
  };
  enterPhase('initial compile');
  const compile = source => provider.services.compiler({ operation: 'compile', target: 'cpu',
    entry: 'main.dl', traced: false, sources: { 'main.dl': source } }, { signal });
  try {
    const delayed = new WorkerConnection(new URL('/__tests__/delayed-worker.mjs', location.href));
    try {
      require((await delayed.request('echo', 'first', { signal })) === 'first',
        'A worker lost a request while its module dependencies initialized');
    } finally { delayed.close(); }
    const result = await compile('import lib/std.dl\nprint line 42\n');
    require(result.status === 0, JSON.stringify(result));
    const chunks = [], events = [];
    enterPhase('first execution');
    await provider.services.program({ artifact: result.artifact, invocation: 1, outputLimit: 1024 },
      { signal, emit: event => { events.push(event.type); if(event.type==='program-output') chunks.push(event.output); } });
    require(chunks.join('') === '42\n', 'The isolated program lost its output');
    require(events[0]==='program-started' && events.filter(type=>type==='program-started').length===1,
      'A program did not announce its execution boundary before output');
    enterPhase('output limit');
    const verbose = await compile('import lib/std.dl\nprint line "Too much output."\n');
    require(verbose.status === 0, JSON.stringify(verbose));
    let outputFailure;
    try {
      await provider.services.program({ artifact: verbose.artifact, invocation: 2, outputLimit: 4 },
        {signal,emit(){}});
    } catch (error) { outputFailure=error.message; }
    require(outputFailure==='An error occurred. Check the log.',
      'The output budget did not terminate execution with a generic client error');
    enterPhase('SDK compile');
    const sdk = await compile('import packages/dynlex-ui/ui/declarations.dl\nwindow demo:\n    button "Test"\nprint line demo\'s count\n');
    require(sdk.status === 0, 'The compiler worker could not import the pinned UI SDK');
    await provider.services.compiler({ operation: 'release', artifact: sdk.artifact }, { signal });
    enterPhase('invalid source');
    const invalid = await compile('unknown instruction\n');
    require(invalid.status !== 0 && !Object.hasOwn(invalid, 'artifact') && invalid.diagnostics.length > 0,
      'A failed compilation retained a runnable artifact');
    enterPhase('infinite source');
    const infinite = await compile('import lib/std.dl\nloop while true:\n    ignore 1\n');
    require(infinite.status === 0, JSON.stringify(infinite));
    const stop = new AbortController();
    const running = provider.services.program({ artifact: infinite.artifact, invocation: 3, outputLimit: 1024 },
      { signal: stop.signal, emit() {} });
    let heartbeat = false;
    setTimeout(() => { heartbeat = true; stop.abort(); }, 150);
    let cancelled = false;
    try { await running; } catch (error) { cancelled = error.name === 'AbortError'; }
    require(heartbeat && cancelled, 'An infinite program blocked the browser or ignored Stop');
    enterPhase('compile after Stop');
    const next = await compile('import lib/std.dl\nprint line 7\n');
    require(next.status === 0, 'Stopping a program damaged the compiler');
    await provider.services.compiler({ operation: 'release', artifact: next.artifact }, { signal });
    enterPhase('debugger');
    const debugSource = "import lib/std.dl\nset counter to 1\nreport counter\nset counter to 9\nprint line counter\n\nto report {integer:number}:\n    set increased to number + 1\n    print line increased\n";
    const debugged = await provider.services.compiler({ operation: 'compile', target: 'cpu',
      entry: 'main.dl', debugged: true, sources: { 'main.dl': debugSource } }, { signal });
    require(debugged.status === 0, JSON.stringify(debugged));
    const pauses = [], waiters = [], debugOutput = [];
    const debugRun = provider.services.program({ artifact: debugged.artifact, invocation: 4, outputLimit: 1024 },
      { signal, emit(event) {
        if (event.type === 'program-output') debugOutput.push(event.output);
        if (event.type === 'program-paused') {
          if (waiters.length) waiters.shift()(event); else pauses.push(event);
        }
      } });
    const paused = () => pauses.length ? Promise.resolve(pauses.shift()) :
      Promise.race([new Promise(resolve => waiters.push(resolve)), debugRun.then(() => { throw new Error('Debugging ended before its pause'); })]);
    const debug = (point, command) => provider.services.debugger({ invocation: 4, pause: point.pause, command }, { signal });
    const value = (point, name, frame = 0) => point.frames[frame].variables.find(variable => variable.name === name)?.value;
    let point = await paused();
    require(value(point, 'counter') === '<uninitialized>', 'The worker read an uninitialized value');
    await debug(point, 'over'); point = await paused();
    require(value(point, 'counter') === '1', 'Step over did not publish the stored runtime value');
    await debug(point, 'into'); point = await paused();
    require(point.frames.length === 2 && value(point, 'number') === '1' && value(point, 'counter', 1) === '1',
      'Step into lost arguments or the caller frame');
    await debug(point, 'out'); point = await paused();
    require(point.frames.length === 1 && debugOutput.join('') === '2\n', 'Step out did not return to its caller');
    await provider.services.debugger({ invocation: 4, command: 'breakpoints',
      breakpoints: [{ uri: point.frames[0].uri, line: 4 }] }, { signal });
    await debug(point, 'continue'); point = await paused();
    require(point.reason === 'breakpoint' && value(point, 'counter') === '9', 'The worker missed its breakpoint');
    await debug(point, 'continue'); await debugRun;
    require(debugOutput.join('') === '2\n9\n', 'Debugging lost program output');
    enterPhase('step into a pure literal call');
    const pure = await provider.services.compiler({ operation: 'compile', target: 'cpu', entry: 'main.dl', debugged: true,
      sources: { 'main.dl': 'import lib/std.dl\nto get increased number:\n    return number + 1\nset answer to increased 7\nprint line answer\n' } }, { signal });
    require(pure.status === 0, JSON.stringify(pure));
    const pureEvents = [], pureWaiting = [], pureOutput = [];
    const pureRunning = provider.services.program({ artifact: pure.artifact, invocation: 6, outputLimit: 1024 },
      { signal, emit(event) {
        if (event.type === 'program-output') pureOutput.push(event.output);
        if (event.type === 'program-paused') {
          if (pureWaiting.length) pureWaiting.shift()(event); else pureEvents.push(event);
        }
      } });
    const purePause = () => pureEvents.length ? Promise.resolve(pureEvents.shift()) : Promise.race([
      new Promise(resolve => pureWaiting.push(resolve)), pureRunning.then(() => { throw new Error('Pure call ended before pausing'); })]);
    let purePoint = await purePause();
    await provider.services.debugger({ invocation: 6, command: 'into', pause: purePoint.pause }, { signal });
    purePoint = await purePause();
    require(purePoint.frames.length === 2 && value(purePoint, 'number') === '7', 'The shipped compiler folded a debuggable literal call');
    await provider.services.debugger({ invocation: 6, command: 'out', pause: purePoint.pause }, { signal });
    purePoint = await purePause();
    require(value(purePoint, 'answer') === '8', 'The pure call changed its result');
    await provider.services.debugger({ invocation: 6, command: 'continue', pause: purePoint.pause }, { signal });
    await pureRunning;
    require(pureOutput.join('') === '8\n', 'The pure call lost its output');
    enterPhase('pause a running debug loop');
    const loopDebug = await provider.services.compiler({ operation: 'compile', target: 'cpu', entry: 'main.dl',
      debugged: true, sources: { 'main.dl': 'import lib/std.dl\nloop while true:\n    ignore 1\n' } }, { signal });
    require(loopDebug.status === 0, JSON.stringify(loopDebug));
    const loopStop = new AbortController(), loopPauses = [], loopWaiters = [];
    const loopRunning = provider.services.program({ artifact: loopDebug.artifact, invocation: 5, outputLimit: 1024 },
      { signal: loopStop.signal, emit(event) {
        if (event.type === 'program-paused') {
          if (loopWaiters.length) loopWaiters.shift()(event); else loopPauses.push(event);
        }
      } });
    const loopResult = loopRunning.then(() => 'completed', error => error.name);
    const loopPause = () => loopPauses.length ? Promise.resolve(loopPauses.shift()) : new Promise(resolve => loopWaiters.push(resolve));
    const entryPoint = await loopPause();
    await provider.services.debugger({ invocation: 5, command: 'continue', pause: entryPoint.pause }, { signal });
    await new Promise(resolve => setTimeout(resolve, 50));
    await provider.services.debugger({ invocation: 5, command: 'pause' }, { signal });
    const interrupted = await loopPause();
    require(interrupted.pause > entryPoint.pause, 'Pause did not interrupt the non-printing debug loop');
    loopStop.abort();
    require(await loopResult === 'AbortError', 'Stop did not terminate the paused debugger');
    enterPhase('language server');
    const source = 'import packages/dynlex-ui/ui/declarations.dl\nwindow demo:\n    button "Test"\nprint line demo\'s count\n';
    await provider.services.language({ operation: 'project', sources: { 'main.dl': source } }, { signal });
    const language = (method, params, id) => provider.services.language({ operation: 'exchange',
      message: { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params } }, { signal });
    const initialized = await language('initialize', { processId: null, rootUri: 'file:///workspace', capabilities: {} }, 1);
    require(initialized.find(message => message.id === 1)?.result?.capabilities !== undefined,
      'The embedded language server did not initialize');
    await language('initialized', {});
    const opened = await language('textDocument/didOpen', { textDocument: {
      uri: 'file:///workspace/main.dl', languageId: 'dynlex', version: 1, text: source } });
    require(!opened.some(message => message.method === 'textDocument/publishDiagnostics'
      && message.params.diagnostics.some(diagnostic => diagnostic.severity === 1)),
      'Language-server imports did not see the installed project dependencies');
    const tokens = await language('textDocument/semanticTokens/full', {
      textDocument: { uri: 'file:///workspace/main.dl' } }, 2);
    require(tokens.find(message => message.id === 2)?.result?.data?.length > 0,
      'The embedded language server returned no semantic tokens');
    await language('shutdown', null, 3); await language('exit', null);
    enterPhase('shader language profile');
    await provider.services.language({ operation: 'reset' }, { signal });
    const shaderSource = 'import lib/shader.dl\nset the fragment color with a red channel of 0.2, a green channel of 0.4, a blue channel of 0.8 and an alpha channel of 1.0\n';
    await provider.services.language({ operation: 'project', sources: { 'preview.dl': shaderSource } }, { signal });
    await language('initialize', { processId: null, rootUri: 'file:///workspace', capabilities: {},
      initializationOptions: { dynlex: { analysisProfiles: [{ target: 'spirv', shaderStage: 'fragment' }] } } }, 1);
    await language('initialized', {});
    const shaderOpened = await language('textDocument/didOpen', { textDocument: {
      uri: 'file:///workspace/preview.dl', languageId: 'dynlex', version: 1, text: shaderSource } });
    require(!shaderOpened.some(message => message.method === 'textDocument/publishDiagnostics'
      && message.params.diagnostics.some(diagnostic => diagnostic.severity === 1)),
      'Resetting the language service did not install the shader analysis profile');
    const shader = await provider.services.compiler({ operation: 'compile', target: 'shader', entry: 'preview.dl',
      stages: ['fragment'], sources: { 'preview.dl': shaderSource } }, { signal });
    require(shader.status === 0 && shader.stages.fragment.webgpu.includes('@fragment')
      && shader.stages.fragment.webgl.includes('void main'), 'The compiler did not return both shader backends');
    return { output: chunks.join(''), compilationMilliseconds: result.milliseconds, cancelled };
  } finally { clearTimeout(timer); provider.close(); }
}
