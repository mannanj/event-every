import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const preload = `${import.meta.dir}/c1-a-offline-preload.cjs`;

function probe(runtime: 'node' | 'bun', expression: string): number {
  const program = `
    (async () => {
      const http=require('node:http'), https=require('node:https'), net=require('node:net'), tls=require('node:tls'), dns=require('node:dns');
      let dispatched=0;
      const request=()=>{dispatched++; return {on(){return this}, end(){return this}}};
      const promise=()=>{dispatched++; return Promise.resolve([])};
      http.request=http.get=https.request=https.get=request;
      net.connect=net.createConnection=tls.connect=request;
      for (const name of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']) {
        if (typeof dns[name] === 'function') dns[name]=request;
        if (dns.promises && typeof dns.promises[name] === 'function') dns.promises[name]=promise;
        if (dns.Resolver && typeof dns.Resolver.prototype[name] === 'function') dns.Resolver.prototype[name]=request;
      }
      global.fetch=request;
      if (global.Bun) {
        global.Bun.connect=request;
        global.Bun.udpSocket=(options)=>{dispatched++; return {send(){dispatched++;}}};
      }
      require(${JSON.stringify(preload)});
      try {
        await (${expression});
        process.exit(dispatched === 0 ? 3 : 2);
      } catch (error) {
        process.exit(error && error.code === 'C1_A_EGRESS_BLOCKED' && dispatched === 0 ? 0 : 1);
      }
    })();
  `;
  return Bun.spawnSync([runtime, '--eval', program], {
    env: { ...process.env, OPENROUTER_API_KEY: 'canary' }, stdout: 'pipe', stderr: 'pipe',
  }).exitCode ?? 1;
}

function allowProbe(runtime: 'node' | 'bun'): number {
  const program = `
    const http=require('node:http'); let dispatched=0;
    http.request=()=>{dispatched++; return {on(){return this},end(){return this}}};
    global.fetch=()=>{dispatched++; return Promise.resolve({ok:true})};
    require(${JSON.stringify(preload)});
    http.request('http://localhost:8788/path', {method:'GET'});
    http.request({hostname:'127.0.0.1',port:8788,path:'/'});
    fetch('http://[::1]:8788/');
    Promise.resolve().then(() => process.exit(
      dispatched===3
      && process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV==='false'
      && process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV==='false'
      && process.env.OPENROUTER_API_KEY==='' ? 0 : 1
    ));
  `;
  return Bun.spawnSync([runtime, '--eval', program], {
    env: { ...process.env, OPENROUTER_API_KEY: 'canary' }, stdout: 'pipe', stderr: 'pipe',
  }).exitCode ?? 1;
}

function websocketProbe(runtime: 'node' | 'bun'): number {
  const program = `
    const http=require('node:http'), net=require('node:net'); let dispatched=0; let bypassed=0; let received;
    const underlying=(options)=>{received=options; dispatched++; return {on(){return this},end(){return this}}};
    http.request=underlying; net.connect=net.createConnection=underlying;
    const custom=()=>{bypassed++;};
    require(${JSON.stringify(preload)});
    http.request({hostname:'127.0.0.1',port:8788,path:'/',socketPath:undefined,agent:undefined,createConnection:null});
    const locked={hostname:'127.0.0.1',port:8788,path:'/',socketPath:undefined,agent:undefined,headers:{Connection:'Upgrade',Upgrade:'websocket'}};
    Object.defineProperty(locked,'createConnection',{value:custom,writable:false,enumerable:true});
    http.request(locked);
    const inherited=Object.create({createConnection:custom});
    Object.assign(inherited,{hostname:'127.0.0.1',port:8788,path:'/',headers:{Connection:'Upgrade',Upgrade:'websocket'}});
    http.request(inherited);
    let reads=0;
    const accessor={hostname:'127.0.0.1',port:8788,path:'/',headers:{Connection:'Upgrade',Upgrade:'websocket'}};
    Object.defineProperty(accessor,'createConnection',{enumerable:true,get(){reads++; return reads <= 2 ? null : reads === 3 ? undefined : custom}});
    try { http.request(accessor); process.exit(2); } catch (error) {
      if (!error || error.code !== 'C1_A_EGRESS_BLOCKED') process.exit(3);
    }
    received.createConnection({host:'127.0.0.1',port:8788,createConnection:custom});
    const polluted={hostname:'127.0.0.1',port:8788,path:'/'};
    Object.defineProperty(polluted,'__proto__',{value:{createConnection:custom},enumerable:true});
    http.request(polluted);
    if (typeof received.createConnection === 'function') received.createConnection({host:'127.0.0.1',port:8788});
    process.exit(dispatched===5 && bypassed===0 ? 0 : 1);
  `;
  return Bun.spawnSync([runtime, '--eval', program], { stdout: 'pipe', stderr: 'pipe' }).exitCode ?? 1;
}

function dotenvProbe(runtime: 'node' | 'bun'): number {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-dotenv-guard-'));
  const names = [
    '.env', '.env.local', '.env.production', '.env.production.local',
    '.env.development', '.env.development.local', '.env.test', '.env.test.local',
  ];
  try {
    mkdirSync(path.join(root, 'scripts'));
    const fixturePreload = path.join(root, 'scripts', 'c1-a-offline-preload.cjs');
    copyFileSync(preload, fixturePreload);
    for (const name of names) writeFileSync(path.join(root, name), `SECRET_${name}=canary\n`);
    writeFileSync(path.join(root, 'ordinary.txt'), 'ordinary');
    const program = `
      const fs = require('node:fs');
      require(${JSON.stringify(fixturePreload)});
      const names = ${JSON.stringify(names)};
      const denied = (operation) => { try { operation(); return false; } catch (error) { return error && error.code === 'ENOENT'; } };
      const syncHidden = names.every((name) => !fs.existsSync(name)
        && denied(() => fs.statSync(name))
        && denied(() => fs.readFileSync(name, 'utf8')));
      Promise.all(names.map((name) => fs.promises.readFile(name).then(
        () => false,
        (error) => error && error.code === 'ENOENT',
      ))).then((results) => process.exit(
        syncHidden
        && results.every(Boolean)
        && fs.existsSync('ordinary.txt')
        && fs.readFileSync('ordinary.txt', 'utf8') === 'ordinary' ? 0 : 1
      ));
    `;
    return Bun.spawnSync([runtime, '--eval', program], { cwd: root, stdout: 'pipe', stderr: 'pipe' }).exitCode ?? 1;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('C1-A offline preload', () => {
  test('blocks all core non-loopback APIs before underlying dispatch in both Node and Bun', () => {
    const calls = [
      `fetch('http://192.0.2.1')`,
      `http.request('http://192.0.2.1')`, `http.get('http://192.0.2.1')`,
      `https.request('https://192.0.2.1')`, `https.get('https://192.0.2.1')`,
      `net.connect({host:'192.0.2.1',port:80})`, `net.createConnection({hostname:'192.0.2.1',port:80})`,
      `tls.connect({host:'192.0.2.1',port:443})`,
      `dns.lookup('example.invalid')`, `dns.resolve('example.invalid')`, `dns.resolve4('example.invalid')`, `dns.resolve6('example.invalid')`,
    ];
    for (const runtime of ['node', 'bun'] as const) for (const call of calls) expect(probe(runtime, call), `${runtime}: ${call}`).toBe(0);
  });

  test('blocks dispatcher, proxy, custom transport, existing-socket, and normalized-host bypasses with zero dispatch', () => {
    const calls = [
      `fetch('http://127.0.0.1',{dispatcher:{}})`,
      `http.request({hostname:'127.0.0.1',agent:{}})`,
      `http.request({hostname:'127.0.0.1',socketPath:'/tmp/x'})`,
      `http.request({hostname:'127.0.0.1',createConnection(){}})`,
      `http.request({hostname:'127.0.0.1',path:'http://example.invalid/'})`,
      `http.request({hostname:'127.0.0.1',method:'CONNECT'})`,
      `http.request({hostname:'127.0.0.1',headers:{host:'example.invalid'}})`,
      `net.connect({host:'localhost',port:1,lookup(){}})`,
      `net.connect({host:'localhost',port:1,fd:3})`,
      `tls.connect({host:'localhost',port:1,socket:{}})`,
      `net.connect({host:'127.1',port:1})`,
    ];
    for (const runtime of ['node', 'bun'] as const) for (const call of calls) expect(probe(runtime, call), `${runtime}: ${call}`).toBe(0);
  });

  test('blocks DNS promises, Resolver variants, and Bun connect/UDP targets before dispatch', () => {
    const common = [
      `dns.promises.resolveAny('example.invalid')`,
      `dns.promises.reverse('192.0.2.1')`,
      `new dns.Resolver().resolveMx('example.invalid')`,
      `new dns.Resolver().resolveTxt('example.invalid')`,
    ];
    for (const runtime of ['node', 'bun'] as const) for (const call of common) expect(probe(runtime, call), `${runtime}: ${call}`).toBe(0);
    for (const call of [
      `Bun.connect({hostname:'192.0.2.1',port:80,socket:{data(){}}})`,
      `Bun.udpSocket({connect:{hostname:'192.0.2.1',port:53},socket:{data(){}}})`,
    ]) expect(probe('bun', call), `bun: ${call}`).toBe(0);
  });

  test('rejects Unix sockets, malformed/missing targets, and nonliteral DNS host:port forms', () => {
    for (const runtime of ['node', 'bun'] as const) for (const call of [
      `net.connect('/tmp/socket')`, `net.connect('')`, `fetch('http://')`, `dns.lookup('localhost:8788')`,
    ]) expect(probe(runtime, call), `${runtime}: ${call}`).toBe(0);
  });

  test('permits only literal loopback URL/options forms and keeps controls false in Node and Bun', () => {
    expect(allowProbe('node')).toBe(0);
    expect(allowProbe('bun')).toBe(0);
  });

  test('replaces the loopback WebSocket connection hook with the guarded transport', () => {
    expect(websocketProbe('node')).toBe(0);
    expect(websocketProbe('bun')).toBe(0);
  });

  test('hides every project dotenv candidate from build children without hiding ordinary files', () => {
    expect(dotenvProbe('node')).toBe(0);
    expect(dotenvProbe('bun')).toBe(0);
  });
});
